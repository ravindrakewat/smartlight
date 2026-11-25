/*
 * MQTT protocol constants, schema version 1.
 *
 * Source of truth: packages/shared/src/iot (topics.ts, payloads.ts) and
 * docs/iot/mqtt-protocol.md. Any change here must be mirrored there (and vice versa).
 */
#pragma once

#define SL_SCHEMA_VERSION 1

/* Topic layout: sl/v1/{tenantId}/{deviceId}/{channel} */
#define SL_TOPIC_ROOT "sl"
#define SL_TOPIC_VERSION "v1"

#define SL_CH_TELEMETRY "telemetry"
#define SL_CH_STATUS "status"
#define SL_CH_EVENT "event"
#define SL_CH_COMMAND "cmd"
#define SL_CH_COMMAND_ACK "cmd/ack"

/* Identifiers: lowercase letters, digits, hyphen; 2-63 chars (MQTT_ID_PATTERN). */
#define SL_ID_MAX_LEN 63

/* Operating modes (LightOperatingMode) */
#define SL_MODE_AUTO "auto"
#define SL_MODE_MANUAL "manual"
#define SL_MODE_FAILSAFE "failsafe"

/* Network interfaces (NetworkInterface) */
#define SL_NET_CELLULAR "cellular"
#define SL_NET_WIFI "wifi"
#define SL_NET_LORAWAN "lorawan"

/* Command acknowledgement status (CommandAckStatus) */
#define SL_ACK_ACCEPTED "accepted"
#define SL_ACK_REJECTED "rejected"
#define SL_ACK_COMPLETED "completed"
#define SL_ACK_FAILED "failed"

/* Event severities (DeviceEventSeverity) */
#define SL_SEVERITY_INFO "info"
#define SL_SEVERITY_WARNING "warning"
#define SL_SEVERITY_CRITICAL "critical"

/* Schedule step anchors (SCHEDULE_ANCHORS) and solar offset limit (SOLAR_OFFSET_LIMIT_MINUTES) */
#define SL_ANCHOR_CLOCK "clock"
#define SL_ANCHOR_SUNSET "sunset"
#define SL_ANCHOR_SUNRISE "sunrise"
#define SL_SOLAR_OFFSET_LIMIT_MIN 240

/* Limits (SCHEDULE_MAX_STEPS, set_config ranges) */
#define SL_SCHEDULE_MAX_STEPS 12
#define SL_TELEMETRY_INTERVAL_MIN_S 30
#define SL_TELEMETRY_INTERVAL_MAX_S 3600
#define SL_TELEMETRY_INTERVAL_DEFAULT_S 300

/* Longest manual override accepted from the cloud (7 days). */
#define SL_MAX_OVERRIDE_S (7 * 24 * 3600)
/* ---- LoRaWAN compact frames, version 1 (packages/shared/src/iot/lorawan.ts) ----
 * Big-endian. Byte 0 = SL_LW_VERSION. Sizes fit IN865 DR0 (51 bytes).
 * Port 10 telemetry (22): flags(b0 lamp on, b1 motion, b2 dark, b3 dark known,
 *   b4-5 mode 0 auto/1 manual/2 failsafe), dim %, V*10 u16, mA u16, W*10 u16,
 *   Wh u32, board temp i8 (-128 = none), ts u32, uptime s u32.
 * Port 20 event (8): event code, severity 0/1/2, ts u32, clears code (0 = none).
 * Port 30 ack (18): command id (16 raw UUID bytes), status 0 accepted/1 rejected/
 *   2 completed/3 failed.
 * Port 40 command (downlink): command id, action 1 set_output (28 bytes: on, dim,
 *   overrideUntil u32, expiresAt u32) or 2 set_auto (22 bytes: expiresAt u32).
 * Not implemented in this firmware yet: the RAK3172 driver waits for the module.
 */
#define SL_LW_VERSION 1
#define SL_LW_PORT_TELEMETRY 10
#define SL_LW_PORT_EVENT 20
#define SL_LW_PORT_ACK 30
#define SL_LW_PORT_COMMAND 40
#define SL_LW_EVT_LAMP_FAILURE 1
#define SL_LW_EVT_RELAY_STUCK 2
#define SL_LW_EVT_DAY_BURNING 3
#define SL_LW_EVT_OVER_CURRENT 4
#define SL_LW_EVT_OVER_VOLTAGE 5
#define SL_LW_EVT_UNDER_VOLTAGE 6
#define SL_LW_EVT_SENSOR_FAULT 7
#define SL_LW_EVT_FAULT_CLEARED 8
#define SL_LW_EVT_BOOT 9


