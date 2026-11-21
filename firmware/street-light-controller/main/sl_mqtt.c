#include "sl_mqtt.h"

#include <stdio.h>
#include <string.h>

#include "esp_crt_bundle.h"
#include "esp_log.h"
#include "mqtt_client.h"
#include "sdkconfig.h"
#include "sl_protocol.h"

static const char *TAG = "sl_mqtt";

#define TOPIC_PREFIX_LEN 144
#define TOPIC_LEN 160

/* Retained Last Will: the broker publishes this if the device drops off unexpectedly. */
static const char LWT_PAYLOAD[] = "{\"v\":1,\"ts\":0,\"online\":false}";

static esp_mqtt_client_handle_t s_client;
static volatile bool s_connected;
static sl_mqtt_callbacks_t s_callbacks;
static char s_prefix[TOPIC_PREFIX_LEN];
static char s_status_topic[TOPIC_LEN];
static char s_command_topic[TOPIC_LEN];

static void build_topic(char *buffer, size_t buffer_len, const char *channel)
{
    snprintf(buffer, buffer_len, "%s/%s", s_prefix, channel);
}

static void on_mqtt_event(void *arg, esp_event_base_t base, int32_t event_id, void *event_data)
{
    (void)arg;
    (void)base;
    esp_mqtt_event_handle_t event = event_data;

    switch ((esp_mqtt_event_id_t)event_id) {
    case MQTT_EVENT_CONNECTED:
        s_connected = true;
        ESP_LOGI(TAG, "Connected to broker");
        esp_mqtt_client_subscribe(s_client, s_command_topic, 1);
        if (s_callbacks.on_connected != NULL) {
            s_callbacks.on_connected();
        }
        break;

    case MQTT_EVENT_DISCONNECTED:
        s_connected = false;
        ESP_LOGW(TAG, "Disconnected from broker");
        break;

    case MQTT_EVENT_DATA:
        /* Commands are small; anything fragmented is not a valid v1 command. */
        if (event->current_data_offset != 0 || event->data_len != event->total_data_len) {
            ESP_LOGW(TAG, "Ignoring fragmented message (%d bytes)", event->total_data_len);
            break;
        }
        if (event->topic_len == (int)strlen(s_command_topic) &&
            strncmp(event->topic, s_command_topic, event->topic_len) == 0 &&
            s_callbacks.on_command != NULL) {
            s_callbacks.on_command(event->data, event->data_len);
        }
        break;

    case MQTT_EVENT_ERROR:
        ESP_LOGW(TAG, "MQTT error event");
        break;

    default:
        break;
    }
}

esp_err_t sl_mqtt_start(const sl_identity_t *identity, const sl_mqtt_callbacks_t *callbacks)
{
    bool secure = strncmp(identity->mqtt_uri, "mqtts://", 8) == 0;
#if !CONFIG_SL_ALLOW_INSECURE_MQTT
    if (!secure) {
        ESP_LOGE(TAG, "Refusing non-TLS broker URI; use mqtts://");
        return ESP_ERR_INVALID_ARG;
    }
#endif

    s_callbacks = *callbacks;
    snprintf(s_prefix, sizeof(s_prefix), "%s/%s/%s/%s", SL_TOPIC_ROOT, SL_TOPIC_VERSION,
             identity->tenant_id, identity->device_id);
    build_topic(s_status_topic, sizeof(s_status_topic), SL_CH_STATUS);
    build_topic(s_command_topic, sizeof(s_command_topic), SL_CH_COMMAND);

    esp_mqtt_client_config_t mqtt_config = {
        .broker.address.uri = identity->mqtt_uri,
        .credentials =
            {
                .client_id = identity->device_id,
                .username = identity->device_id,
                .authentication.password = identity->mqtt_password,
            },
        .session =
            {
                .keepalive = 60,
                .last_will =
                    {
                        .topic = s_status_topic,
                        .msg = LWT_PAYLOAD,
                        .qos = 1,
                        .retain = 1,
                    },
            },
        .network.reconnect_timeout_ms = 10000,
        .buffer.size = 2048,
    };
    if (secure) {
        mqtt_config.broker.verification.crt_bundle_attach = esp_crt_bundle_attach;
    }

    s_client = esp_mqtt_client_init(&mqtt_config);
    if (s_client == NULL) {
        return ESP_FAIL;
    }
    esp_err_t err = esp_mqtt_client_register_event(s_client, ESP_EVENT_ANY_ID, on_mqtt_event, NULL);
    if (err != ESP_OK) {
        return err;
    }
    return esp_mqtt_client_start(s_client);
}

bool sl_mqtt_is_connected(void)
{
    return s_connected;
}

int sl_mqtt_publish(const char *channel, const char *payload, int qos, bool retain)
{
    if (s_client == NULL) {
        return -1;
    }
    char topic[TOPIC_LEN];
    build_topic(topic, sizeof(topic), channel);
    /* enqueue (store=true) never blocks the caller on network I/O. */
    return esp_mqtt_client_enqueue(s_client, topic, payload, 0, qos, retain ? 1 : 0, true);
}
