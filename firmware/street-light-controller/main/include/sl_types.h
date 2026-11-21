#pragma once

#include <stdbool.h>
#include <stdint.h>

#include "sl_protocol.h"

/** One daily schedule entry, minutes after local midnight. */
typedef struct {
    uint16_t at_minute;
    bool on;
    uint8_t dim_percent;
} sl_schedule_step_t;

/** Daily schedule downloaded from the cloud (persisted in NVS). */
typedef struct {
    char id[65];
    int16_t utc_offset_min;
    uint8_t count;
    sl_schedule_step_t steps[SL_SCHEDULE_MAX_STEPS];
} sl_schedule_t;

/** Latest sensor readings. */
typedef struct {
    bool electrical_valid;
    float voltage_v;
    float current_a;
    float power_w;
    float power_factor;

    bool ldr_valid;
    bool is_dark;
    int ldr_mv;

    bool board_temp_valid;
    float board_temp_c;
} sl_readings_t;
