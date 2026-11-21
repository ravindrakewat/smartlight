#pragma once

#include <stdint.h>

#include "esp_err.h"
#include "sl_protocol.h"
#include "sl_types.h"

/** Per-device identity, written once at the factory into the `fctry` NVS partition. */
typedef struct {
    char tenant_id[SL_ID_MAX_LEN + 2];
    char device_id[SL_ID_MAX_LEN + 2];
    char mqtt_uri[128];
    char mqtt_password[128];
    char wifi_ssid[33];
    char wifi_password[65];
} sl_identity_t;

/** Settings the cloud can change at runtime (`set_config`). */
typedef struct {
    uint32_t telemetry_interval_s;
    uint8_t motion_boost_percent;
} sl_runtime_config_t;

/**
 * Loads the device identity from the `fctry` partition, falling back to the
 * Kconfig development defaults. Returns ESP_ERR_INVALID_ARG if the identity is
 * unusable (the device then runs offline in fail-safe mode).
 */
esp_err_t sl_config_load_identity(sl_identity_t *identity);

void sl_config_load_runtime(sl_runtime_config_t *config);
esp_err_t sl_config_save_runtime(const sl_runtime_config_t *config);

/** Loads the stored schedule; leaves `count = 0` when none is stored. */
void sl_config_load_schedule(sl_schedule_t *schedule);
esp_err_t sl_config_save_schedule(const sl_schedule_t *schedule);

double sl_config_load_energy_wh(void);
esp_err_t sl_config_save_energy_wh(double energy_wh);
