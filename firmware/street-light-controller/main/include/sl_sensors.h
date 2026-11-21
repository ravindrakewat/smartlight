#pragma once

#include "esp_err.h"
#include "sl_types.h"

/** Initialises ADC inputs (LDR, current, voltage) and the on-chip temperature sensor. */
esp_err_t sl_sensors_init(void);

/**
 * Takes a fresh set of readings. Voltage and current are sampled together over
 * ~5 mains cycles to compute RMS values, real power and power factor.
 * Fields whose sensor failed are marked invalid.
 */
void sl_sensors_read(sl_readings_t *out);
