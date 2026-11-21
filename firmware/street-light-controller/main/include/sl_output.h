#pragma once

#include <stdbool.h>
#include <stdint.h>

#include "esp_err.h"

/** Configures the relay GPIO and the dimming PWM; leaves the lamp OFF. */
esp_err_t sl_output_init(void);

/**
 * Drives the relay and dimming output. Relay changes are rate-limited to protect
 * the contacts and the LED driver; a deferred change is applied on a later call.
 */
void sl_output_apply(bool on, uint8_t dim_percent);

/** Actual relay state (may lag the request while rate-limited). */
bool sl_output_relay_is_on(void);

uint8_t sl_output_dim_percent(void);
