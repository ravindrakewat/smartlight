#include "sl_net.h"

#include <string.h>

#include "esp_check.h"
#include "esp_event.h"
#include "esp_log.h"
#include "esp_netif.h"
#include "esp_netif_sntp.h"
#include "esp_timer.h"
#include "esp_wifi.h"
#include "freertos/FreeRTOS.h"
#include "freertos/event_groups.h"
#include "sl_protocol.h"

static const char *TAG = "sl_net";

#define NET_UP_BIT BIT0
#define WIFI_RETRY_DELAY_US (10LL * 1000 * 1000)

static EventGroupHandle_t s_events;
static esp_timer_handle_t s_retry_timer;

static void retry_connect(void *arg)
{
    (void)arg;
    esp_wifi_connect();
}

static void on_network_event(void *arg, esp_event_base_t base, int32_t event_id, void *data)
{
    (void)arg;
    (void)data;

    if (base == WIFI_EVENT && event_id == WIFI_EVENT_STA_START) {
        esp_wifi_connect();
    } else if (base == WIFI_EVENT && event_id == WIFI_EVENT_STA_DISCONNECTED) {
        xEventGroupClearBits(s_events, NET_UP_BIT);
        /* Fixed back-off; never block inside the event loop. */
        if (!esp_timer_is_active(s_retry_timer)) {
            esp_timer_start_once(s_retry_timer, WIFI_RETRY_DELAY_US);
        }
        ESP_LOGW(TAG, "Wi-Fi disconnected; retrying in %lld s", WIFI_RETRY_DELAY_US / 1000000);
    } else if (base == IP_EVENT && event_id == IP_EVENT_STA_GOT_IP) {
        xEventGroupSetBits(s_events, NET_UP_BIT);
        ESP_LOGI(TAG, "Wi-Fi connected");
    }
}

esp_err_t sl_net_start(const sl_identity_t *identity)
{
    /* TODO(cellular): bring up SIM7600 over PPP (esp_modem) as the primary link and
     * keep Wi-Fi as the backup. Needs the modem UART/PWRKEY pins from the schematic. */
    if (identity->wifi_ssid[0] == '\0') {
        ESP_LOGW(TAG, "No Wi-Fi credentials provisioned and cellular is not implemented yet");
        return ESP_ERR_INVALID_STATE;
    }

    s_events = xEventGroupCreate();
    ESP_RETURN_ON_FALSE(s_events != NULL, ESP_ERR_NO_MEM, TAG, "event group");

    const esp_timer_create_args_t timer_args = {.callback = retry_connect, .name = "wifi_retry"};
    ESP_RETURN_ON_ERROR(esp_timer_create(&timer_args, &s_retry_timer), TAG, "retry timer");

    ESP_RETURN_ON_ERROR(esp_netif_init(), TAG, "netif init");
    ESP_RETURN_ON_FALSE(esp_netif_create_default_wifi_sta() != NULL, ESP_FAIL, TAG, "wifi netif");

    const wifi_init_config_t init_config = WIFI_INIT_CONFIG_DEFAULT();
    ESP_RETURN_ON_ERROR(esp_wifi_init(&init_config), TAG, "wifi init");
    ESP_RETURN_ON_ERROR(esp_event_handler_register(WIFI_EVENT, ESP_EVENT_ANY_ID,
                                                   on_network_event, NULL),
                        TAG, "wifi events");
    ESP_RETURN_ON_ERROR(esp_event_handler_register(IP_EVENT, IP_EVENT_STA_GOT_IP,
                                                   on_network_event, NULL),
                        TAG, "ip events");

    wifi_config_t wifi_config = {0};
    strlcpy((char *)wifi_config.sta.ssid, identity->wifi_ssid, sizeof(wifi_config.sta.ssid));
    strlcpy((char *)wifi_config.sta.password, identity->wifi_password,
            sizeof(wifi_config.sta.password));
    wifi_config.sta.threshold.authmode = WIFI_AUTH_WPA2_PSK;

    /* Credentials live in the fctry partition; don't duplicate them into Wi-Fi NVS. */
    ESP_RETURN_ON_ERROR(esp_wifi_set_storage(WIFI_STORAGE_RAM), TAG, "wifi storage");
    ESP_RETURN_ON_ERROR(esp_wifi_set_mode(WIFI_MODE_STA), TAG, "wifi mode");
    ESP_RETURN_ON_ERROR(esp_wifi_set_config(WIFI_IF_STA, &wifi_config), TAG, "wifi config");
    ESP_RETURN_ON_ERROR(esp_wifi_start(), TAG, "wifi start");

    /* Device clock runs in UTC; schedules carry their own UTC offset (IST = +330 min). */
    esp_sntp_config_t sntp_config = ESP_NETIF_SNTP_DEFAULT_CONFIG_MULTIPLE(
        2, ESP_SNTP_SERVER_LIST("in.pool.ntp.org", "time.google.com"));
    ESP_RETURN_ON_ERROR(esp_netif_sntp_init(&sntp_config), TAG, "sntp");

    return ESP_OK;
}

bool sl_net_is_up(void)
{
    return s_events != NULL && (xEventGroupGetBits(s_events) & NET_UP_BIT) != 0;
}

int sl_net_rssi_dbm(void)
{
    wifi_ap_record_t ap_info;
    if (sl_net_is_up() && esp_wifi_sta_get_ap_info(&ap_info) == ESP_OK) {
        return ap_info.rssi;
    }
    return 0;
}

const char *sl_net_interface(void)
{
    return SL_NET_WIFI;
}
