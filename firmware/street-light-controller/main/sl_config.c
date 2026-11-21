#include "sl_config.h"

#include <ctype.h>
#include <math.h>
#include <string.h>

#include "esp_log.h"
#include "nvs.h"
#include "nvs_flash.h"
#include "sdkconfig.h"

static const char *TAG = "sl_config";

/* Factory partition (identity, written once per device). */
#define FACTORY_PARTITION "fctry"
#define FACTORY_NAMESPACE "identity"

/* Runtime state in the default `nvs` partition. */
#define STATE_NAMESPACE "sl_state"
#define KEY_TELEMETRY_INTERVAL "tlm_int"
#define KEY_MOTION_BOOST "boost"
#define KEY_SCHEDULE "schedule"
#define KEY_ENERGY_MWH "energy_mwh"

static void read_str(nvs_handle_t handle, bool opened, const char *key, char *dst, size_t dst_len,
                     const char *fallback)
{
    size_t len = dst_len;
    if (!opened || nvs_get_str(handle, key, dst, &len) != ESP_OK) {
        strlcpy(dst, fallback, dst_len);
    }
}

/* Mirrors MQTT_ID_PATTERN in @smart-light/shared: ^[a-z0-9][a-z0-9-]{1,62}$ */
static bool is_valid_id(const char *id)
{
    size_t len = strlen(id);
    if (len < 2 || len > SL_ID_MAX_LEN) {
        return false;
    }
    for (size_t i = 0; i < len; i++) {
        char c = id[i];
        bool ok = islower((unsigned char)c) || isdigit((unsigned char)c) || (c == '-' && i > 0);
        if (!ok) {
            return false;
        }
    }
    return true;
}

esp_err_t sl_config_load_identity(sl_identity_t *identity)
{
    memset(identity, 0, sizeof(*identity));

    nvs_handle_t handle = 0;
    bool opened = false;
    esp_err_t err = nvs_flash_init_partition(FACTORY_PARTITION);
    if (err == ESP_OK) {
        opened = nvs_open_from_partition(FACTORY_PARTITION, FACTORY_NAMESPACE, NVS_READONLY,
                                         &handle) == ESP_OK;
    }
    if (!opened) {
        ESP_LOGW(TAG, "Factory identity not found; using development defaults");
    }

    read_str(handle, opened, "tenant_id", identity->tenant_id, sizeof(identity->tenant_id),
             CONFIG_SL_DEV_TENANT_ID);
    read_str(handle, opened, "device_id", identity->device_id, sizeof(identity->device_id),
             CONFIG_SL_DEV_DEVICE_ID);
    read_str(handle, opened, "mqtt_uri", identity->mqtt_uri, sizeof(identity->mqtt_uri),
             CONFIG_SL_DEV_MQTT_URI);
    read_str(handle, opened, "mqtt_pass", identity->mqtt_password,
             sizeof(identity->mqtt_password), CONFIG_SL_DEV_MQTT_PASSWORD);
    read_str(handle, opened, "wifi_ssid", identity->wifi_ssid, sizeof(identity->wifi_ssid),
             CONFIG_SL_DEV_WIFI_SSID);
    read_str(handle, opened, "wifi_pass", identity->wifi_password,
             sizeof(identity->wifi_password), CONFIG_SL_DEV_WIFI_PASSWORD);

    if (opened) {
        nvs_close(handle);
    }

    if (!is_valid_id(identity->tenant_id) || !is_valid_id(identity->device_id)) {
        ESP_LOGE(TAG, "Invalid tenant_id/device_id; device will run offline");
        return ESP_ERR_INVALID_ARG;
    }
    if (identity->mqtt_uri[0] == '\0' || identity->mqtt_password[0] == '\0') {
        ESP_LOGE(TAG, "MQTT URI or password missing; device will run offline");
        return ESP_ERR_INVALID_ARG;
    }

    ESP_LOGI(TAG, "Identity: tenant=%s device=%s", identity->tenant_id, identity->device_id);
    return ESP_OK;
}

void sl_config_load_runtime(sl_runtime_config_t *config)
{
    config->telemetry_interval_s = SL_TELEMETRY_INTERVAL_DEFAULT_S;
    config->motion_boost_percent = 0;

    nvs_handle_t handle;
    if (nvs_open(STATE_NAMESPACE, NVS_READONLY, &handle) != ESP_OK) {
        return;
    }
    uint32_t interval = 0;
    if (nvs_get_u32(handle, KEY_TELEMETRY_INTERVAL, &interval) == ESP_OK &&
        interval >= SL_TELEMETRY_INTERVAL_MIN_S && interval <= SL_TELEMETRY_INTERVAL_MAX_S) {
        config->telemetry_interval_s = interval;
    }
    uint8_t boost = 0;
    if (nvs_get_u8(handle, KEY_MOTION_BOOST, &boost) == ESP_OK && boost <= 100) {
        config->motion_boost_percent = boost;
    }
    nvs_close(handle);
}

esp_err_t sl_config_save_runtime(const sl_runtime_config_t *config)
{
    nvs_handle_t handle;
    esp_err_t err = nvs_open(STATE_NAMESPACE, NVS_READWRITE, &handle);
    if (err != ESP_OK) {
        return err;
    }
    err = nvs_set_u32(handle, KEY_TELEMETRY_INTERVAL, config->telemetry_interval_s);
    if (err == ESP_OK) {
        err = nvs_set_u8(handle, KEY_MOTION_BOOST, config->motion_boost_percent);
    }
    if (err == ESP_OK) {
        err = nvs_commit(handle);
    }
    nvs_close(handle);
    return err;
}

void sl_config_load_schedule(sl_schedule_t *schedule)
{
    memset(schedule, 0, sizeof(*schedule));

    nvs_handle_t handle;
    if (nvs_open(STATE_NAMESPACE, NVS_READONLY, &handle) != ESP_OK) {
        return;
    }
    size_t len = sizeof(*schedule);
    if (nvs_get_blob(handle, KEY_SCHEDULE, schedule, &len) != ESP_OK ||
        len != sizeof(*schedule) || schedule->count > SL_SCHEDULE_MAX_STEPS) {
        memset(schedule, 0, sizeof(*schedule));
    } else {
        schedule->id[sizeof(schedule->id) - 1] = '\0';
        ESP_LOGI(TAG, "Loaded schedule '%s' (%u steps)", schedule->id, schedule->count);
    }
    nvs_close(handle);
}

esp_err_t sl_config_save_schedule(const sl_schedule_t *schedule)
{
    nvs_handle_t handle;
    esp_err_t err = nvs_open(STATE_NAMESPACE, NVS_READWRITE, &handle);
    if (err != ESP_OK) {
        return err;
    }
    err = nvs_set_blob(handle, KEY_SCHEDULE, schedule, sizeof(*schedule));
    if (err == ESP_OK) {
        err = nvs_commit(handle);
    }
    nvs_close(handle);
    return err;
}

double sl_config_load_energy_wh(void)
{
    nvs_handle_t handle;
    uint64_t milli_wh = 0;
    if (nvs_open(STATE_NAMESPACE, NVS_READONLY, &handle) == ESP_OK) {
        nvs_get_u64(handle, KEY_ENERGY_MWH, &milli_wh);
        nvs_close(handle);
    }
    return (double)milli_wh / 1000.0;
}

esp_err_t sl_config_save_energy_wh(double energy_wh)
{
    nvs_handle_t handle;
    esp_err_t err = nvs_open(STATE_NAMESPACE, NVS_READWRITE, &handle);
    if (err != ESP_OK) {
        return err;
    }
    err = nvs_set_u64(handle, KEY_ENERGY_MWH, (uint64_t)llround(energy_wh * 1000.0));
    if (err == ESP_OK) {
        err = nvs_commit(handle);
    }
    nvs_close(handle);
    return err;
}
