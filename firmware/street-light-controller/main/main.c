/*
 * Smart Street Light Controller - ESP32-S3
 * Part of the Smart Street Light Management System.
 */
#include "esp_event.h"
#include "nvs_flash.h"
#include "sl_app.h"

void app_main(void)
{
    esp_err_t err = nvs_flash_init();
    if (err == ESP_ERR_NVS_NO_FREE_PAGES || err == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        /* Runtime NVS only (schedule, energy). Identity lives in the fctry partition. */
        ESP_ERROR_CHECK(nvs_flash_erase());
        err = nvs_flash_init();
    }
    ESP_ERROR_CHECK(err);
    ESP_ERROR_CHECK(esp_event_loop_create_default());

    sl_app_start();
}
