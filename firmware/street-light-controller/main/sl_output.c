#include "sl_output.h"

#include "driver/gpio.h"
#include "driver/ledc.h"
#include "esp_check.h"
#include "esp_log.h"
#include "esp_timer.h"
#include "sdkconfig.h"

static const char *TAG = "sl_output";

#define DIM_LEDC_MODE LEDC_LOW_SPEED_MODE
#define DIM_LEDC_TIMER LEDC_TIMER_0
#define DIM_LEDC_CHANNEL LEDC_CHANNEL_0
#define DIM_LEDC_RESOLUTION LEDC_TIMER_10_BIT
#define DIM_LEDC_MAX_DUTY ((1U << 10) - 1U)
#define DIM_PWM_FREQUENCY_HZ 1000

/* Minimum time between relay switches: protects contacts and the LED driver from
 * rapid cycling (e.g. repeated commands or a flickering LDR). */
#define RELAY_MIN_TOGGLE_INTERVAL_US (5LL * 1000 * 1000)

#if CONFIG_SL_DIM_PWM_INVERTED
#define DIM_OUTPUT_INVERT 1
#else
#define DIM_OUTPUT_INVERT 0
#endif

#if CONFIG_SL_RELAY_ACTIVE_HIGH
#define RELAY_LEVEL_ON 1
#define RELAY_LEVEL_OFF 0
#else
#define RELAY_LEVEL_ON 0
#define RELAY_LEVEL_OFF 1
#endif

static bool s_relay_on;
static bool s_has_toggled;
static int64_t s_last_toggle_us;
static uint8_t s_dim_percent;

esp_err_t sl_output_init(void)
{
    const gpio_config_t relay_config = {
        .pin_bit_mask = 1ULL << CONFIG_SL_PIN_RELAY,
        .mode = GPIO_MODE_OUTPUT,
        .pull_up_en = GPIO_PULLUP_DISABLE,
        .pull_down_en = GPIO_PULLDOWN_DISABLE,
        .intr_type = GPIO_INTR_DISABLE,
    };
    ESP_RETURN_ON_ERROR(gpio_set_level(CONFIG_SL_PIN_RELAY, RELAY_LEVEL_OFF), TAG, "relay level");
    ESP_RETURN_ON_ERROR(gpio_config(&relay_config), TAG, "relay gpio");

    const ledc_timer_config_t timer_config = {
        .speed_mode = DIM_LEDC_MODE,
        .duty_resolution = DIM_LEDC_RESOLUTION,
        .timer_num = DIM_LEDC_TIMER,
        .freq_hz = DIM_PWM_FREQUENCY_HZ,
        .clk_cfg = LEDC_AUTO_CLK,
    };
    ESP_RETURN_ON_ERROR(ledc_timer_config(&timer_config), TAG, "ledc timer");

    const ledc_channel_config_t channel_config = {
        .gpio_num = CONFIG_SL_PIN_DIM_PWM,
        .speed_mode = DIM_LEDC_MODE,
        .channel = DIM_LEDC_CHANNEL,
        .timer_sel = DIM_LEDC_TIMER,
        .duty = 0,
        .hpoint = 0,
        .flags.output_invert = DIM_OUTPUT_INVERT,
    };
    ESP_RETURN_ON_ERROR(ledc_channel_config(&channel_config), TAG, "ledc channel");

    s_relay_on = false;
    s_dim_percent = 0;
    ESP_LOGI(TAG, "Outputs ready (relay GPIO %d, dim GPIO %d)", CONFIG_SL_PIN_RELAY,
             CONFIG_SL_PIN_DIM_PWM);
    return ESP_OK;
}

static void set_dim(uint8_t dim_percent)
{
    if (dim_percent > 100) {
        dim_percent = 100;
    }
    uint32_t duty = (DIM_LEDC_MAX_DUTY * dim_percent) / 100U;
    ledc_set_duty(DIM_LEDC_MODE, DIM_LEDC_CHANNEL, duty);
    ledc_update_duty(DIM_LEDC_MODE, DIM_LEDC_CHANNEL);
    s_dim_percent = dim_percent;
}

void sl_output_apply(bool on, uint8_t dim_percent)
{
    if (on != s_relay_on) {
        int64_t now_us = esp_timer_get_time();
        if (s_has_toggled && now_us - s_last_toggle_us < RELAY_MIN_TOGGLE_INTERVAL_US) {
            return; /* Rate-limited; retried on the next control cycle. */
        }
        if (!on) {
            set_dim(0); /* Ramp the driver down before opening the relay. */
        }
        gpio_set_level(CONFIG_SL_PIN_RELAY, on ? RELAY_LEVEL_ON : RELAY_LEVEL_OFF);
        s_relay_on = on;
        s_has_toggled = true;
        s_last_toggle_us = now_us;
        ESP_LOGI(TAG, "Relay %s", on ? "ON" : "OFF");
    }

    uint8_t target = s_relay_on ? dim_percent : 0;
    if (target != s_dim_percent) {
        set_dim(target);
    }
}

bool sl_output_relay_is_on(void)
{
    return s_relay_on;
}

uint8_t sl_output_dim_percent(void)
{
    return s_dim_percent;
}
