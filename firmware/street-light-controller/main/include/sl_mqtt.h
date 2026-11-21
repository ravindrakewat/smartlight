#pragma once

#include <stdbool.h>

#include "esp_err.h"
#include "sl_config.h"

typedef struct {
    /** Called on every (re)connection, after the command topic is subscribed. */
    void (*on_connected)(void);
    /** Called with a complete payload received on the device's command topic. */
    void (*on_command)(const char *data, int len);
} sl_mqtt_callbacks_t;

/**
 * Starts the MQTT client (TLS, per-device credentials, retained `offline` Last Will).
 * `identity` must outlive the client.
 */
esp_err_t sl_mqtt_start(const sl_identity_t *identity, const sl_mqtt_callbacks_t *callbacks);

bool sl_mqtt_is_connected(void);

/**
 * Queues a payload on `sl/v1/{tenant}/{device}/{channel}`. Non-blocking.
 * Returns the message id, or a negative value on failure.
 */
int sl_mqtt_publish(const char *channel, const char *payload, int qos, bool retain);
