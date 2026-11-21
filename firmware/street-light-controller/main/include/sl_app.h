#pragma once

/**
 * Starts the controller: outputs, sensors, control loop, network and MQTT.
 * Lighting keeps working (fail-safe mode) even if provisioning or the network fails.
 */
void sl_app_start(void);
