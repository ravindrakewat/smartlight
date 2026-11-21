/*
 * Controller application: control loop, schedule, fault detection, MQTT commands
 * and telemetry.
 *
 * Concurrency: the control task owns outputs, readings, energy and faults.
 * Command handling runs in the MQTT task and only touches the "desired state"
 * (manual override, schedule, runtime config), which is guarded by `s_lock`.
 */
#include "sl_app.h"

#include <inttypes.h>
#include <math.h>
#include <string.h>
#include <time.h>

#include "cJSON.h"
#include "esp_app_desc.h"
#include "esp_log.h"
#include "esp_ota_ops.h"
#include "esp_system.h"
#include "esp_task_wdt.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/semphr.h"
#include "freertos/task.h"
#include "sdkconfig.h"
#include "sl_config.h"
#include "sl_mqtt.h"
#include "sl_net.h"
#include "sl_output.h"
#include "sl_protocol.h"
#include "sl_sensors.h"

static const char *TAG = "sl_app";

#define CONTROL_PERIOD_MS 1000
#define CONTROL_TASK_STACK 6144
#define CONTROL_TASK_PRIORITY 5
#define ENERGY_PERSIST_INTERVAL_US (15LL * 60 * 1000 * 1000)
#define REBOOT_DELAY_US (3LL * 1000 * 1000)
#define SECONDS_US(s) ((int64_t)(s) * 1000 * 1000)

/* Any epoch before this means SNTP has not synced yet (2023-11-14). */
#define MIN_VALID_EPOCH 1700000000

#define CMD_ID_LEN 36
#define CMD_DEDUP_SLOTS 8

/* ─── Faults ──────────────────────────────────────────────────────────────── */

typedef enum {
    FAULT_LAMP_FAILURE,
    FAULT_RELAY_STUCK,
    FAULT_OVER_CURRENT,
    FAULT_OVER_VOLTAGE,
    FAULT_UNDER_VOLTAGE,
    FAULT_COUNT,
} fault_t;

typedef struct {
    const char *type;     /* DeviceEventType */
    const char *severity; /* DeviceEventSeverity */
    int64_t delay_us;     /* condition must persist this long before raising */
} fault_info_t;

static const fault_info_t FAULTS[FAULT_COUNT] = {
    [FAULT_LAMP_FAILURE] = {"lamp_failure", SL_SEVERITY_CRITICAL, SECONDS_US(30)},
    [FAULT_RELAY_STUCK] = {"relay_stuck", SL_SEVERITY_CRITICAL, SECONDS_US(10)},
    [FAULT_OVER_CURRENT] = {"over_current", SL_SEVERITY_CRITICAL, SECONDS_US(5)},
    [FAULT_OVER_VOLTAGE] = {"over_voltage", SL_SEVERITY_WARNING, SECONDS_US(10)},
    [FAULT_UNDER_VOLTAGE] = {"under_voltage", SL_SEVERITY_WARNING, SECONDS_US(10)},
};

/* ─── State ───────────────────────────────────────────────────────────────── */

/* Desired state, shared between the MQTT task and the control task. */
static SemaphoreHandle_t s_lock;
static sl_runtime_config_t s_runtime;
static sl_schedule_t s_schedule;
static bool s_manual_active;
static bool s_manual_on;
static uint8_t s_manual_dim;
static int64_t s_manual_deadline_us;
static char s_recent_cmd_ids[CMD_DEDUP_SLOTS][CMD_ID_LEN + 1];
static uint8_t s_recent_cmd_next;

/* Owned by the control task. */
static sl_identity_t s_identity;
static sl_readings_t s_readings;
static const char *s_mode = SL_MODE_FAILSAFE;
static double s_energy_wh;
static bool s_fault_active[FAULT_COUNT];
static int64_t s_fault_since_us[FAULT_COUNT];
/* Set from the MQTT task to request an immediate telemetry report. */
static volatile bool s_publish_telemetry_now;

static uint32_t s_sequence;
static bool s_boot_event_sent;
static esp_timer_handle_t s_reboot_timer;

/* ─── Helpers ─────────────────────────────────────────────────────────────── */

static uint32_t next_sequence(void)
{
    return __atomic_fetch_add(&s_sequence, 1, __ATOMIC_RELAXED);
}

static bool clock_is_valid(void)
{
    return time(NULL) >= MIN_VALID_EPOCH;
}

static double device_timestamp(void)
{
    return clock_is_valid() ? (double)time(NULL) : 0;
}

static double round2(double value)
{
    return round(value * 100.0) / 100.0;
}

static void lock(void)
{
    xSemaphoreTake(s_lock, portMAX_DELAY);
}

static void unlock(void)
{
    xSemaphoreGive(s_lock);
}

static void publish_json(const char *channel, cJSON *root, int qos, bool retain)
{
    char *json = cJSON_PrintUnformatted(root);
    if (json != NULL) {
        if (sl_mqtt_publish(channel, json, qos, retain) < 0) {
            ESP_LOGW(TAG, "Publish to %s failed", channel);
        }
        cJSON_free(json);
    }
    cJSON_Delete(root);
}

static const char *reset_reason_name(esp_reset_reason_t reason)
{
    switch (reason) {
    case ESP_RST_POWERON:
        return "poweron";
    case ESP_RST_SW:
        return "software";
    case ESP_RST_PANIC:
        return "panic";
    case ESP_RST_INT_WDT:
    case ESP_RST_TASK_WDT:
    case ESP_RST_WDT:
        return "watchdog";
    case ESP_RST_BROWNOUT:
        return "brownout";
    case ESP_RST_DEEPSLEEP:
        return "deepsleep";
    default:
        return "other";
    }
}

/* ─── Schedule & mode decision ────────────────────────────────────────────── */

/* Returns the active step: the latest step at or before the current local minute,
 * wrapping to the last step of the previous day. Steps may be in any order. */
static bool schedule_lookup(const sl_schedule_t *schedule, time_t now, bool *on, uint8_t *dim)
{
    if (schedule->count == 0) {
        return false;
    }
    int64_t local_seconds = (int64_t)now + (int64_t)schedule->utc_offset_min * 60;
    int minute_of_day = (int)((((local_seconds % 86400) + 86400) % 86400) / 60);

    int current = -1;
    int latest = -1;
    for (int i = 0; i < schedule->count; i++) {
        uint16_t at = schedule->steps[i].at_minute;
        if (at <= minute_of_day && (current < 0 || at > schedule->steps[current].at_minute)) {
            current = i;
        }
        if (latest < 0 || at > schedule->steps[latest].at_minute) {
            latest = i;
        }
    }
    const sl_schedule_step_t *step = &schedule->steps[current >= 0 ? current : latest];
    *on = step->on;
    *dim = step->dim_percent;
    return true;
}

/* Priority: manual override > cloud schedule (needs valid clock) > LDR fail-safe. */
static void decide_outputs(int64_t now_us, bool *on, uint8_t *dim, const char **mode)
{
    lock();
    if (s_manual_active && now_us >= s_manual_deadline_us) {
        s_manual_active = false;
        ESP_LOGI(TAG, "Manual override expired");
    }

    if (s_manual_active) {
        *on = s_manual_on;
        *dim = s_manual_dim;
        *mode = SL_MODE_MANUAL;
    } else if (clock_is_valid() && schedule_lookup(&s_schedule, time(NULL), on, dim)) {
        *mode = SL_MODE_AUTO;
    } else {
        *on = s_readings.is_dark;
        *dim = 100;
        *mode = SL_MODE_FAILSAFE;
    }
    unlock();

    if (!*on) {
        *dim = 0;
    }
}

/* ─── Faults ──────────────────────────────────────────────────────────────── */

static void publish_fault_event(fault_t fault, bool raised)
{
    if (!sl_mqtt_is_connected()) {
        return;
    }
    cJSON *root = cJSON_CreateObject();
    cJSON_AddNumberToObject(root, "v", SL_SCHEMA_VERSION);
    cJSON_AddNumberToObject(root, "ts", device_timestamp());
    cJSON_AddNumberToObject(root, "seq", next_sequence());
    if (raised) {
        cJSON_AddStringToObject(root, "type", FAULTS[fault].type);
        cJSON_AddStringToObject(root, "severity", FAULTS[fault].severity);
    } else {
        cJSON_AddStringToObject(root, "type", "fault_cleared");
        cJSON_AddStringToObject(root, "severity", SL_SEVERITY_INFO);
        cJSON_AddStringToObject(root, "clears", FAULTS[fault].type);
    }
    cJSON *snapshot = cJSON_AddObjectToObject(root, "snapshot");
    cJSON_AddNumberToObject(snapshot, "voltageV", round2(s_readings.voltage_v));
    cJSON_AddNumberToObject(snapshot, "currentA", round2(s_readings.current_a));
    cJSON_AddBoolToObject(snapshot, "lampOn", sl_output_relay_is_on());
    publish_json(SL_CH_EVENT, root, 1, false);
}

static void update_fault(fault_t fault, bool condition, int64_t now_us)
{
    if (condition) {
        if (s_fault_since_us[fault] == 0) {
            s_fault_since_us[fault] = now_us;
        }
        if (!s_fault_active[fault] && now_us - s_fault_since_us[fault] >= FAULTS[fault].delay_us) {
            s_fault_active[fault] = true;
            ESP_LOGW(TAG, "Fault raised: %s", FAULTS[fault].type);
            publish_fault_event(fault, true);
        }
    } else {
        s_fault_since_us[fault] = 0;
        if (s_fault_active[fault]) {
            s_fault_active[fault] = false;
            ESP_LOGI(TAG, "Fault cleared: %s", FAULTS[fault].type);
            publish_fault_event(fault, false);
        }
    }
}

static void evaluate_faults(int64_t now_us)
{
    if (!s_readings.electrical_valid) {
        return;
    }
    const double min_lamp_a = CONFIG_SL_LAMP_MIN_CURRENT_MA / 1000.0;
    const double voltage = s_readings.voltage_v;
    const double current = s_readings.current_a;
    const bool relay_on = sl_output_relay_is_on();
    const bool mains_present = voltage >= CONFIG_SL_UNDER_VOLTAGE_V;

    update_fault(FAULT_LAMP_FAILURE, relay_on && mains_present && current < min_lamp_a, now_us);
    update_fault(FAULT_RELAY_STUCK, !relay_on && current >= 2 * min_lamp_a, now_us);
    update_fault(FAULT_OVER_CURRENT, current * 1000.0 >= CONFIG_SL_OVER_CURRENT_MA, now_us);
    update_fault(FAULT_OVER_VOLTAGE, voltage >= CONFIG_SL_OVER_VOLTAGE_V, now_us);
    /* Below ~50 V the reading is a sensor problem, not a brown-out (the board runs on mains). */
    update_fault(FAULT_UNDER_VOLTAGE, voltage > 50.0 && voltage < CONFIG_SL_UNDER_VOLTAGE_V,
                 now_us);
}

/* ─── Telemetry & status ──────────────────────────────────────────────────── */

static void publish_telemetry(void)
{
    cJSON *root = cJSON_CreateObject();
    cJSON_AddNumberToObject(root, "v", SL_SCHEMA_VERSION);
    cJSON_AddNumberToObject(root, "ts", device_timestamp());
    cJSON_AddNumberToObject(root, "seq", next_sequence());

    cJSON *lamp = cJSON_AddObjectToObject(root, "lamp");
    cJSON_AddBoolToObject(lamp, "on", sl_output_relay_is_on());
    cJSON_AddNumberToObject(lamp, "dimPercent", sl_output_dim_percent());
    cJSON_AddStringToObject(lamp, "mode", s_mode);

    cJSON *electrical = cJSON_AddObjectToObject(root, "electrical");
    bool valid = s_readings.electrical_valid;
    cJSON_AddNumberToObject(electrical, "voltageV", valid ? round2(s_readings.voltage_v) : 0);
    cJSON_AddNumberToObject(electrical, "currentA", valid ? round2(s_readings.current_a) : 0);
    cJSON_AddNumberToObject(electrical, "powerW", valid ? round2(s_readings.power_w) : 0);
    cJSON_AddNumberToObject(electrical, "energyWh", round2(s_energy_wh));
    if (valid && s_readings.current_a > 0) {
        cJSON_AddNumberToObject(electrical, "powerFactor", round2(s_readings.power_factor));
    }

    cJSON *environment = cJSON_AddObjectToObject(root, "environment");
    cJSON_AddBoolToObject(environment, "isDark", s_readings.is_dark);
    /* TODO(sensors): BH1750 ambient lux (I2C) and 24 GHz radar presence (UART). */
    cJSON_AddBoolToObject(environment, "motionDetected", false);

    cJSON *device = cJSON_AddObjectToObject(root, "device");
    cJSON_AddStringToObject(device, "firmwareVersion", esp_app_get_description()->version);
    cJSON_AddNumberToObject(device, "uptimeSec", (double)(esp_timer_get_time() / 1000000));
    cJSON_AddStringToObject(device, "network", sl_net_interface());
    cJSON_AddNumberToObject(device, "rssiDbm", sl_net_rssi_dbm());
    if (s_readings.board_temp_valid) {
        cJSON_AddNumberToObject(device, "boardTempC", round2(s_readings.board_temp_c));
    }

    publish_json(SL_CH_TELEMETRY, root, 0, false);
}

static void on_mqtt_connected(void)
{
    /* Reaching the broker proves this firmware works: cancel any pending OTA rollback. */
    esp_ota_mark_app_valid_cancel_rollback();

    cJSON *status = cJSON_CreateObject();
    cJSON_AddNumberToObject(status, "v", SL_SCHEMA_VERSION);
    cJSON_AddNumberToObject(status, "ts", device_timestamp());
    cJSON_AddBoolToObject(status, "online", true);
    cJSON_AddStringToObject(status, "firmwareVersion", esp_app_get_description()->version);
    cJSON_AddStringToObject(status, "resetReason", reset_reason_name(esp_reset_reason()));
    publish_json(SL_CH_STATUS, status, 1, true);

    if (!s_boot_event_sent) {
        s_boot_event_sent = true;
        cJSON *event = cJSON_CreateObject();
        cJSON_AddNumberToObject(event, "v", SL_SCHEMA_VERSION);
        cJSON_AddNumberToObject(event, "ts", device_timestamp());
        cJSON_AddNumberToObject(event, "seq", next_sequence());
        cJSON_AddStringToObject(event, "type", "boot");
        cJSON_AddStringToObject(event, "severity", SL_SEVERITY_INFO);
        cJSON_AddStringToObject(event, "message", reset_reason_name(esp_reset_reason()));
        publish_json(SL_CH_EVENT, event, 1, false);
    }

    s_publish_telemetry_now = true;
}

/* ─── Commands ────────────────────────────────────────────────────────────── */

static void publish_ack(const char *cmd_id, const char *status, const char *reason)
{
    cJSON *root = cJSON_CreateObject();
    cJSON_AddNumberToObject(root, "v", SL_SCHEMA_VERSION);
    cJSON_AddNumberToObject(root, "ts", device_timestamp());
    cJSON_AddStringToObject(root, "cmdId", cmd_id);
    cJSON_AddStringToObject(root, "status", status);
    if (reason != NULL) {
        cJSON_AddStringToObject(root, "reason", reason);
    }
    publish_json(SL_CH_COMMAND_ACK, root, 1, false);
}

static bool get_int(const cJSON *object, const char *key, int64_t min, int64_t max,
                    int64_t *out)
{
    const cJSON *item = cJSON_GetObjectItemCaseSensitive(object, key);
    if (!cJSON_IsNumber(item)) {
        return false;
    }
    double value = item->valuedouble;
    if (value != floor(value) || value < (double)min || value > (double)max) {
        return false;
    }
    *out = (int64_t)value;
    return true;
}

static bool get_bool(const cJSON *object, const char *key, bool *out)
{
    const cJSON *item = cJSON_GetObjectItemCaseSensitive(object, key);
    if (!cJSON_IsBool(item)) {
        return false;
    }
    *out = cJSON_IsTrue(item);
    return true;
}

/* Must be called with the lock held. */
static bool command_seen(const char *cmd_id)
{
    for (int i = 0; i < CMD_DEDUP_SLOTS; i++) {
        if (strcmp(s_recent_cmd_ids[i], cmd_id) == 0) {
            return true;
        }
    }
    return false;
}

/* Must be called with the lock held. */
static void remember_command(const char *cmd_id)
{
    strlcpy(s_recent_cmd_ids[s_recent_cmd_next], cmd_id, sizeof(s_recent_cmd_ids[0]));
    s_recent_cmd_next = (s_recent_cmd_next + 1) % CMD_DEDUP_SLOTS;
}

static void reboot_now(void *arg)
{
    (void)arg;
    esp_restart();
}

/* Each handler validates its fields and returns NULL on success or a rejection reason. */

static const char *handle_set_output(const cJSON *root)
{
    bool on = false;
    int64_t dim = 0, issued_at = 0, override_until = 0;
    if (!get_bool(root, "on", &on) || !get_int(root, "dimPercent", 0, 100, &dim) ||
        !get_int(root, "issuedAt", 0, INT32_MAX, &issued_at) ||
        !get_int(root, "overrideUntil", 0, UINT32_MAX, &override_until)) {
        return "invalid set_output fields";
    }
    /* Duration is relative to issuedAt so the override works even without a synced clock. */
    int64_t duration_s = override_until - issued_at;
    if (duration_s <= 0 || duration_s > SL_MAX_OVERRIDE_S) {
        return "override duration out of range";
    }
    lock();
    s_manual_active = true;
    s_manual_on = on;
    s_manual_dim = (uint8_t)dim;
    s_manual_deadline_us = esp_timer_get_time() + SECONDS_US(duration_s);
    unlock();
    return NULL;
}

static const char *handle_set_auto(void)
{
    lock();
    s_manual_active = false;
    unlock();
    return NULL;
}

static const char *handle_set_schedule(const cJSON *root)
{
    sl_schedule_t schedule = {0};
    int64_t offset = 0;
    const cJSON *id = cJSON_GetObjectItemCaseSensitive(root, "scheduleId");
    const cJSON *steps = cJSON_GetObjectItemCaseSensitive(root, "steps");
    if (!cJSON_IsString(id) || strlen(id->valuestring) == 0 ||
        strlen(id->valuestring) >= sizeof(schedule.id) ||
        !get_int(root, "utcOffsetMinutes", -720, 840, &offset) || !cJSON_IsArray(steps)) {
        return "invalid set_schedule fields";
    }
    int count = cJSON_GetArraySize(steps);
    if (count < 1 || count > SL_SCHEDULE_MAX_STEPS) {
        return "schedule must have 1-12 steps";
    }

    strlcpy(schedule.id, id->valuestring, sizeof(schedule.id));
    schedule.utc_offset_min = (int16_t)offset;
    schedule.count = (uint8_t)count;
    for (int i = 0; i < count; i++) {
        const cJSON *step = cJSON_GetArrayItem(steps, i);
        int64_t at_minute = 0, dim = 0;
        bool on = false;
        if (!get_int(step, "atMinute", 0, 1439, &at_minute) || !get_bool(step, "on", &on) ||
            !get_int(step, "dimPercent", 0, 100, &dim)) {
            return "invalid schedule step";
        }
        schedule.steps[i] = (sl_schedule_step_t){
            .at_minute = (uint16_t)at_minute,
            .on = on,
            .dim_percent = (uint8_t)dim,
        };
    }

    lock();
    s_schedule = schedule;
    unlock();
    if (sl_config_save_schedule(&schedule) != ESP_OK) {
        ESP_LOGW(TAG, "Schedule applied but not persisted");
    }
    ESP_LOGI(TAG, "Schedule '%s' applied (%d steps)", schedule.id, count);
    return NULL;
}

static const char *handle_set_config(const cJSON *root)
{
    int64_t interval = 0, boost = 0;
    bool has_interval = cJSON_HasObjectItem(root, "telemetryIntervalSec");
    bool has_boost = cJSON_HasObjectItem(root, "motionBoostPercent");
    if ((has_interval && !get_int(root, "telemetryIntervalSec", SL_TELEMETRY_INTERVAL_MIN_S,
                                  SL_TELEMETRY_INTERVAL_MAX_S, &interval)) ||
        (has_boost && !get_int(root, "motionBoostPercent", 0, 100, &boost))) {
        return "invalid set_config fields";
    }

    lock();
    if (has_interval) {
        s_runtime.telemetry_interval_s = (uint32_t)interval;
    }
    if (has_boost) {
        s_runtime.motion_boost_percent = (uint8_t)boost;
    }
    sl_runtime_config_t snapshot = s_runtime;
    unlock();

    if (sl_config_save_runtime(&snapshot) != ESP_OK) {
        ESP_LOGW(TAG, "Config applied but not persisted");
    }
    return NULL;
}

static void on_mqtt_command(const char *data, int len)
{
    cJSON *root = cJSON_ParseWithLength(data, (size_t)len);
    if (root == NULL) {
        ESP_LOGW(TAG, "Command is not valid JSON");
        return;
    }

    const cJSON *cmd_id_item = cJSON_GetObjectItemCaseSensitive(root, "cmdId");
    if (!cJSON_IsString(cmd_id_item) || strlen(cmd_id_item->valuestring) != CMD_ID_LEN) {
        ESP_LOGW(TAG, "Command without a valid cmdId; cannot acknowledge");
        cJSON_Delete(root);
        return;
    }
    char cmd_id[CMD_ID_LEN + 1];
    strlcpy(cmd_id, cmd_id_item->valuestring, sizeof(cmd_id));

    const char *reason = NULL;
    int64_t version = 0, expires_at = 0;
    const cJSON *action_item = cJSON_GetObjectItemCaseSensitive(root, "action");

    if (!get_int(root, "v", 0, 1000, &version) || version != SL_SCHEMA_VERSION) {
        reason = "unsupported schema version";
    } else if (!cJSON_IsString(action_item)) {
        reason = "missing action";
    } else if (!get_int(root, "expiresAt", 0, UINT32_MAX, &expires_at)) {
        reason = "missing expiresAt";
    } else if (clock_is_valid() && (int64_t)time(NULL) > expires_at) {
        reason = "command expired";
    }

    if (reason == NULL) {
        lock();
        bool duplicate = command_seen(cmd_id);
        unlock();
        if (duplicate) {
            /* Broker redelivery (QoS 1): already applied, acknowledge again. */
            publish_ack(cmd_id, SL_ACK_ACCEPTED, NULL);
            cJSON_Delete(root);
            return;
        }

        const char *action = action_item->valuestring;
        bool reboot = false;
        if (strcmp(action, "set_output") == 0) {
            reason = handle_set_output(root);
        } else if (strcmp(action, "set_auto") == 0) {
            reason = handle_set_auto();
        } else if (strcmp(action, "set_schedule") == 0) {
            reason = handle_set_schedule(root);
        } else if (strcmp(action, "set_config") == 0) {
            reason = handle_set_config(root);
        } else if (strcmp(action, "reboot") == 0) {
            reboot = true;
        } else if (strcmp(action, "ota_update") == 0) {
            reason = "ota_update not supported by this firmware yet";
        } else {
            reason = "unknown action";
        }

        if (reason == NULL) {
            lock();
            remember_command(cmd_id);
            unlock();
            ESP_LOGI(TAG, "Command %s accepted (%s)", cmd_id, action);
            s_publish_telemetry_now = true;
        }
        if (reboot && reason == NULL) {
            esp_timer_start_once(s_reboot_timer, REBOOT_DELAY_US);
        }
    }

    if (reason != NULL) {
        ESP_LOGW(TAG, "Command %s rejected: %s", cmd_id, reason);
    }
    publish_ack(cmd_id, reason == NULL ? SL_ACK_ACCEPTED : SL_ACK_REJECTED, reason);
    cJSON_Delete(root);
}

/* ─── Control loop ────────────────────────────────────────────────────────── */

static void control_task(void *arg)
{
    (void)arg;
    ESP_ERROR_CHECK(esp_task_wdt_add(NULL));

    int64_t last_sample_us = esp_timer_get_time();
    int64_t last_telemetry_us = 0;
    int64_t last_energy_save_us = last_sample_us;

    for (;;) {
        esp_task_wdt_reset();

        sl_sensors_read(&s_readings);
        int64_t now_us = esp_timer_get_time();

        if (s_readings.electrical_valid) {
            double hours = (double)(now_us - last_sample_us) / 3.6e9;
            s_energy_wh += s_readings.power_w * hours;
        }
        last_sample_us = now_us;

        bool on = false;
        uint8_t dim = 0;
        const char *mode = SL_MODE_FAILSAFE;
        decide_outputs(now_us, &on, &dim, &mode);
        if (strcmp(mode, s_mode) != 0) {
            ESP_LOGI(TAG, "Mode: %s -> %s", s_mode, mode);
            s_mode = mode;
        }
        sl_output_apply(on, dim);

        evaluate_faults(now_us);

        lock();
        int64_t interval_us = SECONDS_US(s_runtime.telemetry_interval_s);
        unlock();
        if (sl_mqtt_is_connected() &&
            (s_publish_telemetry_now || now_us - last_telemetry_us >= interval_us)) {
            s_publish_telemetry_now = false;
            last_telemetry_us = now_us;
            publish_telemetry();
        }

        if (now_us - last_energy_save_us >= ENERGY_PERSIST_INTERVAL_US) {
            last_energy_save_us = now_us;
            sl_config_save_energy_wh(s_energy_wh);
        }

        vTaskDelay(pdMS_TO_TICKS(CONTROL_PERIOD_MS));
    }
}

/* ─── Start-up ────────────────────────────────────────────────────────────── */

void sl_app_start(void)
{
    ESP_LOGI(TAG, "Smart Street Light Controller %s", esp_app_get_description()->version);

    s_lock = xSemaphoreCreateMutex();
    configASSERT(s_lock != NULL);

    const esp_timer_create_args_t reboot_args = {.callback = reboot_now, .name = "reboot"};
    ESP_ERROR_CHECK(esp_timer_create(&reboot_args, &s_reboot_timer));

    /* Outputs first so the relay is in a known state as early as possible. */
    ESP_ERROR_CHECK(sl_output_init());
    if (sl_sensors_init() != ESP_OK) {
        ESP_LOGE(TAG, "Some sensors failed to initialise; lamp will fail ON when unsure");
    }

    sl_config_load_runtime(&s_runtime);
    sl_config_load_schedule(&s_schedule);
    s_energy_wh = sl_config_load_energy_wh();

    /* Lighting must never depend on connectivity: start the control loop first. */
    xTaskCreate(control_task, "sl_control", CONTROL_TASK_STACK, NULL, CONTROL_TASK_PRIORITY,
                NULL);

    if (sl_config_load_identity(&s_identity) != ESP_OK) {
        ESP_LOGE(TAG, "Device not provisioned; running offline in fail-safe mode");
        return;
    }
    if (sl_net_start(&s_identity) != ESP_OK) {
        ESP_LOGE(TAG, "Network unavailable; running offline");
        return;
    }
    const sl_mqtt_callbacks_t callbacks = {
        .on_connected = on_mqtt_connected,
        .on_command = on_mqtt_command,
    };
    if (sl_mqtt_start(&s_identity, &callbacks) != ESP_OK) {
        ESP_LOGE(TAG, "MQTT client failed to start; running offline");
    }
}
