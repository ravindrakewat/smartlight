#pragma once

#include <stdbool.h>
#include <stdint.h>

#include "sl_protocol.h"

typedef enum {
    SL_ANCHOR_AT_CLOCK = 0,
    SL_ANCHOR_AT_SUNSET = 1,
    SL_ANCHOR_AT_SUNRISE = 2,
} sl_anchor_t;

/**
 * One daily schedule entry: a fixed local time (`minute` after midnight) or an
 * offset in minutes from today's sunset/sunrise at the pole.
 */
typedef struct {
    uint8_t anchor; /* sl_anchor_t */
    int16_t minute;
    bool on;
    uint8_t dim_percent;
} sl_schedule_step_t;

/** Daily schedule downloaded from the cloud (persisted in NVS). */
typedef struct {
    char id[65];
    int16_t utc_offset_min;
    uint8_t count;
    /* Pole position for the astronomical clock; required by sunset/sunrise steps. */
    bool has_location;
    float latitude;
    float longitude;
    sl_schedule_step_t steps[SL_SCHEDULE_MAX_STEPS];
} sl_schedule_t;

/** Latest sensor readings. */
typedef struct {
    bool electrical_valid;
    float voltage_v;
    float current_a;
    float power_w;
    float power_factor;

    /* Legacy LDR input (Phase 1 boards). Day/night now comes from the astronomical
     * clock; the reading is kept for diagnostics only and never switches the lamp. */
    bool ldr_valid;
    bool is_dark;
    int ldr_mv;

    bool board_temp_valid;
    float board_temp_c;
} sl_readings_t;
