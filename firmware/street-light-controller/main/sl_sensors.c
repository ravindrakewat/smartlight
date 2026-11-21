#include "sl_sensors.h"

#include <math.h>
#include <string.h>

#include "driver/temperature_sensor.h"
#include "esp_adc/adc_cali.h"
#include "esp_adc/adc_cali_scheme.h"
#include "esp_adc/adc_oneshot.h"
#include "esp_check.h"
#include "esp_log.h"
#include "esp_timer.h"
#include "sdkconfig.h"

static const char *TAG = "sl_sensors";

/* 100 ms = 5 full cycles of 50 Hz mains: enough for a stable RMS value. */
#define RMS_WINDOW_US (100 * 1000)
#define RMS_MIN_SAMPLES 100
#define LDR_SAMPLES 16

#define VOLTAGE_SCALE (CONFIG_SL_VOLTAGE_SCALE_X100 / 100.0)
#define CURRENT_SCALE (CONFIG_SL_CURRENT_SCALE_X100 / 100.0)

typedef struct {
    bool ready;
    adc_channel_t channel;
    adc_cali_handle_t cali;
} adc_input_t;

static adc_oneshot_unit_handle_t s_adc;
static adc_input_t s_ldr;
static adc_input_t s_current;
static adc_input_t s_voltage;
static temperature_sensor_handle_t s_tsens;
static bool s_is_dark;

static esp_err_t setup_input(int gpio, adc_input_t *input)
{
    adc_unit_t unit;
    ESP_RETURN_ON_ERROR(adc_oneshot_io_to_channel(gpio, &unit, &input->channel), TAG,
                        "GPIO %d is not an ADC pin", gpio);
    ESP_RETURN_ON_FALSE(unit == ADC_UNIT_1, ESP_ERR_INVALID_ARG, TAG,
                        "GPIO %d is on ADC2 (unusable while Wi-Fi is active)", gpio);

    const adc_oneshot_chan_cfg_t channel_config = {
        .atten = ADC_ATTEN_DB_12,
        .bitwidth = ADC_BITWIDTH_DEFAULT,
    };
    ESP_RETURN_ON_ERROR(adc_oneshot_config_channel(s_adc, input->channel, &channel_config), TAG,
                        "config GPIO %d", gpio);

    const adc_cali_curve_fitting_config_t cali_config = {
        .unit_id = ADC_UNIT_1,
        .chan = input->channel,
        .atten = ADC_ATTEN_DB_12,
        .bitwidth = ADC_BITWIDTH_DEFAULT,
    };
    ESP_RETURN_ON_ERROR(adc_cali_create_scheme_curve_fitting(&cali_config, &input->cali), TAG,
                        "calibration GPIO %d", gpio);

    input->ready = true;
    return ESP_OK;
}

esp_err_t sl_sensors_init(void)
{
    /* Until the first LDR reading (or if the ADC fails) assume dark, so the lamp
     * fails ON: an unlit street is the worst outcome for public safety. */
    s_is_dark = true;

    const adc_oneshot_unit_init_cfg_t unit_config = {.unit_id = ADC_UNIT_1};
    ESP_RETURN_ON_ERROR(adc_oneshot_new_unit(&unit_config, &s_adc), TAG, "adc unit");

    esp_err_t result = ESP_OK;
    if (setup_input(CONFIG_SL_PIN_LDR_ADC, &s_ldr) != ESP_OK) {
        result = ESP_FAIL;
    }
    if (setup_input(CONFIG_SL_PIN_CURRENT_ADC, &s_current) != ESP_OK) {
        result = ESP_FAIL;
    }
    if (setup_input(CONFIG_SL_PIN_VOLTAGE_ADC, &s_voltage) != ESP_OK) {
        result = ESP_FAIL;
    }

    const temperature_sensor_config_t tsens_config = TEMPERATURE_SENSOR_CONFIG_DEFAULT(-10, 80);
    if (temperature_sensor_install(&tsens_config, &s_tsens) != ESP_OK ||
        temperature_sensor_enable(s_tsens) != ESP_OK) {
        ESP_LOGW(TAG, "Board temperature sensor unavailable");
        s_tsens = NULL;
    }

    return result;
}

static esp_err_t read_mv(const adc_input_t *input, int *out_mv)
{
    int raw = 0;
    esp_err_t err = adc_oneshot_read(s_adc, input->channel, &raw);
    if (err != ESP_OK) {
        return err;
    }
    return adc_cali_raw_to_voltage(input->cali, raw, out_mv);
}

static void measure_electrical(sl_readings_t *out)
{
    out->electrical_valid = false;
    if (!s_voltage.ready || !s_current.ready) {
        return;
    }

    /* Interleaved sampling of voltage and current so mean(v*i) yields real power. */
    double sum_v = 0, sum_i = 0, sum_vv = 0, sum_ii = 0, sum_vi = 0;
    uint32_t samples = 0;
    int64_t start_us = esp_timer_get_time();
    while (esp_timer_get_time() - start_us < RMS_WINDOW_US) {
        int v_mv = 0;
        int i_mv = 0;
        if (read_mv(&s_voltage, &v_mv) != ESP_OK || read_mv(&s_current, &i_mv) != ESP_OK) {
            return;
        }
        sum_v += v_mv;
        sum_i += i_mv;
        sum_vv += (double)v_mv * v_mv;
        sum_ii += (double)i_mv * i_mv;
        sum_vi += (double)v_mv * i_mv;
        samples++;
    }
    if (samples < RMS_MIN_SAMPLES) {
        return;
    }

    /* Remove the sensors' DC bias (mid-supply offset) and compute AC statistics. */
    double mean_v = sum_v / samples;
    double mean_i = sum_i / samples;
    double var_v = fmax(sum_vv / samples - mean_v * mean_v, 0.0);
    double var_i = fmax(sum_ii / samples - mean_i * mean_i, 0.0);
    double cov_vi = sum_vi / samples - mean_v * mean_i;

    double voltage_v = sqrt(var_v) / 1000.0 * VOLTAGE_SCALE;
    double current_a = sqrt(var_i) / 1000.0 * CURRENT_SCALE;
    /* fabs: a CT clamped in reverse orientation flips the sign, not the magnitude. */
    double power_w = fabs(cov_vi) / 1e6 * VOLTAGE_SCALE * CURRENT_SCALE;

    if (current_a * 1000.0 < CONFIG_SL_CURRENT_NOISE_FLOOR_MA) {
        current_a = 0;
        power_w = 0;
    }

    double apparent_va = voltage_v * current_a;
    out->voltage_v = (float)voltage_v;
    out->current_a = (float)current_a;
    out->power_w = (float)power_w;
    out->power_factor = apparent_va > 0 ? (float)fmin(power_w / apparent_va, 1.0) : 0.0f;
    out->electrical_valid = true;
}

static void measure_ldr(sl_readings_t *out)
{
    out->ldr_valid = false;
    if (s_ldr.ready) {
        int total_mv = 0;
        int count = 0;
        for (int i = 0; i < LDR_SAMPLES; i++) {
            int mv = 0;
            if (read_mv(&s_ldr, &mv) == ESP_OK) {
                total_mv += mv;
                count++;
            }
        }
        if (count > 0) {
            int mv = total_mv / count;
            out->ldr_mv = mv;
            out->ldr_valid = true;
#if CONFIG_SL_LDR_DARK_IS_HIGH
            bool goes_dark = mv >= CONFIG_SL_LDR_DARK_MV;
            bool goes_light = mv <= CONFIG_SL_LDR_LIGHT_MV;
#else
            bool goes_dark = mv <= CONFIG_SL_LDR_DARK_MV;
            bool goes_light = mv >= CONFIG_SL_LDR_LIGHT_MV;
#endif
            if (goes_dark) {
                s_is_dark = true;
            } else if (goes_light) {
                s_is_dark = false;
            }
        }
    }
    /* With no valid LDR reading the previous verdict (initially dark) is kept. */
    out->is_dark = s_is_dark;
}

void sl_sensors_read(sl_readings_t *out)
{
    measure_electrical(out);
    measure_ldr(out);

    out->board_temp_valid = false;
    float celsius = 0;
    if (s_tsens != NULL && temperature_sensor_get_celsius(s_tsens, &celsius) == ESP_OK) {
        out->board_temp_c = celsius;
        out->board_temp_valid = true;
    }
}
