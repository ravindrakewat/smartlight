// Copy this file to secrets.h (same folder) and fill in your values.
// secrets.h is git-ignored: never commit Wi-Fi or broker passwords.
#pragma once

// Router Wi-Fi: optional. Normally set from the phone page (hotspot "SmartLight-RGBW",
// http://192.168.4.1 -> "Wi-Fi setup"); that choice is saved on the board and wins.
// These are used only while nothing is saved. 2.4 GHz only.
// #define WIFI_SSID "your-wifi-name"
// #define WIFI_PASS "your-wifi-password"

// ---- Option A: dev broker on your PC (`npm run dev:broker -w @smart-light/api`) ----
// Use the PC's IPv4 address (PowerShell: ipconfig), not "localhost".
#define MQTT_HOST "192.168.1.50"
#define MQTT_PORT 1883
#define MQTT_TLS 0  // plain MQTT, local network only
#define MQTT_USER ""
#define MQTT_PASS ""

// ---- Option B: cloud broker (EMQX Cloud / own VPS), as used with Render ----
// #define MQTT_HOST "xxxxxxxx.ala.asia-southeast1.emqxsl.com"
// #define MQTT_PORT 8883
// #define MQTT_TLS 1          // TLS, certificate checked against src/mqtt_ca.h
// #define MQTT_USER "sl-xxxxxx"  // broker username for this device (= DEVICE_ID)
// #define MQTT_PASS "device-password-from-the-broker"

// Topic: sl/v1/<TENANT_ID>/<DEVICE_ID>/...  Must match a controller registered on a pole
// in the database the worker writes to (local seed: sl-000001; production: see README).
#define TENANT_ID "indore-mc"
#define DEVICE_ID "sl-000001"
