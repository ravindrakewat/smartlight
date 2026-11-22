/*
 * NOAA sunrise/sunset (the "General Solar Position Calculations" used by the NOAA
 * Solar Calculator). Angles in degrees unless noted. See sl_sun.h.
 */
#include "sl_sun.h"

#include <math.h>

#define PI 3.14159265358979323846

/* Sun's centre 0.833° below the horizon: refraction + solar disc radius. */
#define SUNRISE_ZENITH_DEG 90.833

static double rad(double deg)
{
    return deg * PI / 180.0;
}

static double deg(double rad_value)
{
    return rad_value * 180.0 / PI;
}

/* Julian day at 0h UT of a Gregorian calendar date. */
static double julian_day(int year, int month, int day)
{
    if (month <= 2) {
        year -= 1;
        month += 12;
    }
    int a = year / 100;
    int b = 2 - a + a / 4;
    return floor(365.25 * (year + 4716)) + floor(30.6001 * (month + 1)) + day + b - 1524.5;
}

bool sl_sun_times(int year, int month, int day, double latitude_deg, double longitude_deg,
                  int utc_offset_min, double *sunrise_min, double *sunset_min)
{
    /* Julian century at local noon of that date. */
    double jd = julian_day(year, month, day) + (720.0 - utc_offset_min) / 1440.0;
    double t = (jd - 2451545.0) / 36525.0;

    double mean_long = fmod(280.46646 + t * (36000.76983 + t * 0.0003032), 360.0);
    double mean_anom = 357.52911 + t * (35999.05029 - 0.0001537 * t);
    double eccent = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);

    double m = rad(mean_anom);
    double centre = sin(m) * (1.914602 - t * (0.004817 + 0.000014 * t)) +
                    sin(2 * m) * (0.019993 - 0.000101 * t) + sin(3 * m) * 0.000289;
    double true_long = mean_long + centre;
    double omega = rad(125.04 - 1934.136 * t);
    double apparent_long = true_long - 0.00569 - 0.00478 * sin(omega);

    double mean_obliq =
        23.0 + (26.0 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60.0) / 60.0;
    double obliq = mean_obliq + 0.00256 * cos(omega);

    double declination = asin(sin(rad(obliq)) * sin(rad(apparent_long)));

    double y = tan(rad(obliq) / 2.0);
    y *= y;
    double l0 = rad(mean_long);
    double eq_of_time =
        4.0 * deg(y * sin(2 * l0) - 2 * eccent * sin(m) + 4 * eccent * y * sin(m) * cos(2 * l0) -
                  0.5 * y * y * sin(4 * l0) - 1.25 * eccent * eccent * sin(2 * m));

    double lat = rad(latitude_deg);
    double cos_hour_angle = cos(rad(SUNRISE_ZENITH_DEG)) / (cos(lat) * cos(declination)) -
                            tan(lat) * tan(declination);
    if (cos_hour_angle < -1.0 || cos_hour_angle > 1.0) {
        return false;
    }
    double hour_angle = deg(acos(cos_hour_angle));

    double solar_noon = 720.0 - 4.0 * longitude_deg - eq_of_time + utc_offset_min;
    *sunrise_min = solar_noon - hour_angle * 4.0;
    *sunset_min = solar_noon + hour_angle * 4.0;
    return true;
}
