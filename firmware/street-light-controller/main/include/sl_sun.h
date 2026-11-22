/*
 * Astronomical clock: today's sunrise and sunset at the pole (NOAA solar
 * position algorithm, accurate to about a minute for Indian latitudes).
 *
 * Pure C with no ESP-IDF dependencies, so it is unit-tested on the host
 * (firmware/street-light-controller/test/test_sun.c, run in CI).
 */
#pragma once

#include <stdbool.h>

/**
 * Computes sunrise and sunset for a civil date at a location.
 *
 * @param year, month, day   local calendar date
 * @param latitude_deg       north positive
 * @param longitude_deg      east positive
 * @param utc_offset_min     local time zone offset from UTC in minutes (IST = 330)
 * @param sunrise_min        out: minutes after local midnight (may be < 0 or ≥ 1440 at
 *                           extreme offsets; callers wrap as needed)
 * @param sunset_min         out: as above
 * @return false when the sun does not rise or set that day (polar day/night).
 */
bool sl_sun_times(int year, int month, int day, double latitude_deg, double longitude_deg,
                  int utc_offset_min, double *sunrise_min, double *sunset_min);
