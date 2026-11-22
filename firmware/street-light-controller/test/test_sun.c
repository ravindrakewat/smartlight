/*
 * Host unit test for the astronomical clock (main/sl_sun.c). Runs in CI:
 *
 *   gcc -std=c11 -Wall -Wextra -Werror -Imain/include test/test_sun.c main/sl_sun.c -lm
 *
 * Reference times are the published NOAA Solar Calculator values (IST, rounded
 * to the minute); the firmware must agree within two minutes.
 */
#include <math.h>
#include <stdio.h>
#include <stdlib.h>

#include "sl_sun.h"

#define IST 330
#define TOLERANCE_MIN 2.0

static int failures = 0;

static void expect_times(const char *name, int year, int month, int day, double lat, double lng,
                         int sunrise_hh, int sunrise_mm, int sunset_hh, int sunset_mm)
{
    double sunrise = 0, sunset = 0;
    if (!sl_sun_times(year, month, day, lat, lng, IST, &sunrise, &sunset)) {
        printf("FAIL %s: no sunrise/sunset computed\n", name);
        failures++;
        return;
    }
    double want_rise = sunrise_hh * 60 + sunrise_mm;
    double want_set = sunset_hh * 60 + sunset_mm;
    int ok = fabs(sunrise - want_rise) <= TOLERANCE_MIN && fabs(sunset - want_set) <= TOLERANCE_MIN;
    printf("%s %s: sunrise %.1f (want %.0f), sunset %.1f (want %.0f)\n", ok ? "ok  " : "FAIL",
           name, sunrise, want_rise, sunset, want_set);
    if (!ok) {
        failures++;
    }
}

int main(void)
{
    /* New Delhi */
    expect_times("Delhi summer solstice", 2026, 6, 21, 28.6139, 77.2090, 5, 24, 19, 22);
    expect_times("Delhi winter solstice", 2026, 12, 21, 28.6139, 77.2090, 7, 10, 17, 29);
    /* Indore */
    expect_times("Indore 22 Nov", 2026, 11, 22, 22.7196, 75.8577, 6, 44, 17, 41);
    expect_times("Indore equinox", 2026, 3, 20, 22.7196, 75.8577, 6, 31, 18, 37);

    /* Polar day: the sun never sets, so there is no answer (lamp falls back to ON). */
    double rise = 0, set = 0;
    if (sl_sun_times(2026, 6, 21, 80.0, 15.0, 60, &rise, &set)) {
        printf("FAIL polar day: expected no sunset\n");
        failures++;
    } else {
        printf("ok   polar day: no sunset\n");
    }

    if (failures > 0) {
        printf("%d failure(s)\n", failures);
        return EXIT_FAILURE;
    }
    printf("all sun tests passed\n");
    return EXIT_SUCCESS;
}
