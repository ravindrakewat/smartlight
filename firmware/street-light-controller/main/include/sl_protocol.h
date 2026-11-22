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
