# Street Light Controller Firmware (ESP32-S3)

Firmware for the Smart Street Light Controller PCB: relay + 0–10 V/PWM dimming, mains voltage and
lamp current sensing, LDR day/night detection, MQTT over TLS to the platform.

Protocol: [`docs/iot/mqtt-protocol.md`](../../docs/iot/mqtt-protocol.md).

## Design principles

- **Lighting never depends on the network.** The control loop starts before Wi-Fi/MQTT. Without
  provisioning, a schedule or a synced clock, the lamp follows the LDR (`failsafe` mode).
- **Fail ON.** If the LDR or ADC fails, the controller assumes darkness — an unlit street is the
  worst outcome.
- **No secrets in code.** Device identity and credentials live in the `fctry` NVS partition,
  written once per device at the factory.
- **Safe updates.** Two OTA slots with rollback: a new image is confirmed only after it reaches
  the broker.
- **Self-healing.** Task watchdog, reboot on panic, brown-out detection, relay rate limiting
  (≥ 5 s between switches).

## Module layout

| File           | Responsibility                                                      |
| -------------- | ------------------------------------------------------------------- |
| `main.c`       | NVS + event loop init, starts the app                               |
| `sl_app.c`     | Control loop, mode priority, schedule, faults, commands, telemetry  |
| `sl_output.c`  | Relay GPIO and LEDC dimming PWM                                     |
| `sl_sensors.c` | ADC: RMS voltage/current, real power, power factor; LDR; board temp |
| `sl_net.c`     | Connectivity (Wi-Fi today, 4G planned) and SNTP                     |
| `sl_mqtt.c`    | MQTT client, TLS, Last Will, topic routing                          |
| `sl_config.c`  | Factory identity + runtime state in NVS                             |

## Build & flash

Requires [ESP-IDF v5.4](https://docs.espressif.com/projects/esp-idf/en/v5.4/esp32s3/get-started/).

```bash
cd firmware/street-light-controller
idf.py set-target esp32s3
idf.py menuconfig        # "Smart Street Light Controller": pins, calibration, dev defaults
idf.py build
idf.py -p COM5 flash monitor
```

CI compiles the firmware on every push (`.github/workflows/ci.yml`, job `firmware`).

## Factory provisioning

Each device gets its own identity in the `fctry` partition (namespace `identity`). Create a CSV
per device (**never commit it**):

```csv
key,type,encoding,value
identity,namespace,,
tenant_id,data,string,indore-mc
device_id,data,string,sl-000123
mqtt_uri,data,string,mqtts://<broker-host>:8883
mqtt_pass,data,string,<per-device-secret>
wifi_ssid,data,string,<optional>
wifi_pass,data,string,<optional>
```

```bash
python $IDF_PATH/components/nvs_flash/nvs_partition_generator/nvs_partition_gen.py \
  generate sl-000123.csv sl-000123.bin 0x6000
esptool.py --chip esp32s3 -p COM5 write_flash 0x3E0000 sl-000123.bin
```

Without a factory identity, the Kconfig "Development defaults" are used (bench testing only).

## Before field deployment — must confirm

1. **Pin map:** every GPIO in `menuconfig → Board pin map` is a placeholder. Confirm against the
   PCB schematic. Analog inputs must be on ADC1 (GPIO1–GPIO10); ADC2 does not work with Wi-Fi.
2. **Sensor calibration:** set `SL_VOLTAGE_SCALE_X100` and `SL_CURRENT_SCALE_X100` per board
   against a reference meter.
3. **ADC input range:** sensor outputs must stay within 0–3.1 V at the ESP32 pin (5 V sensors
   need a divider).
4. **Security:** enable Secure Boot v2 and flash encryption (`sdkconfig.defaults`) once the
   signing keys are set up.

## Roadmap

| Item                                   | Status     |
| -------------------------------------- | ---------- |
| Relay, dimming, fail-safe LDR control  | ✅ Done    |
| RMS voltage/current, power, energy     | ✅ Done    |
| Faults: lamp failure, relay stuck, V/I | ✅ Done    |
| MQTT TLS, commands, schedule, ack      | ✅ Done    |
| Wi-Fi + SNTP                           | ✅ Done    |
| SIM7600 4G (primary link)              | ⏳ Next    |
| OTA update (`ota_update` command)      | ⏳ Next    |
| BH1750 lux, 24 GHz radar motion        | ⏳ Next    |
| Status LEDs, offline telemetry buffer  | ⏳ Planned |
| Secure Boot v2 + flash encryption      | ⏳ Planned |
