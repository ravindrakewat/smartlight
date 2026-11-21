#pragma once

#include <stdbool.h>

#include "esp_err.h"
#include "sl_config.h"

/**
 * Brings up network connectivity and SNTP time sync.
 *
 * Current implementation: Wi-Fi station. Planned: SIM7600 4G (PPP via esp_modem)
 * as the primary link with Wi-Fi as backup. Callers only use this interface, so
 * adding cellular does not affect the rest of the firmware.
 */
esp_err_t sl_net_start(const sl_identity_t *identity);

bool sl_net_is_up(void);

/** Signal strength in dBm, or 0 when unknown. */
int sl_net_rssi_dbm(void);

/** Active interface name (SL_NET_WIFI / SL_NET_CELLULAR). */
const char *sl_net_interface(void);
