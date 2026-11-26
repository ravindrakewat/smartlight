// Bench test: street light driver dimming (+PWM opto input) and RGBW colour channels.
// Not production firmware. Phone: join Wi-Fi "SmartLight-RGBW", open http://192.168.4.1
// MQTT: joins your router (src/secrets.h) and speaks protocol v1 (docs/iot/mqtt-protocol.md)
// over plain MQTT to the dev broker. Production firmware uses TLS (../../street-light-controller).
#include <Arduino.h>
#include <ArduinoJson.h>
#include <Preferences.h>
#include <PubSubClient.h>
#include <WebServer.h>
#include <WiFi.h>
#include <esp_system.h>
#include <time.h>

#include "driver/ledc.h"

#if __has_include("secrets.h")
#include "secrets.h"
#else
#error "Copy src/secrets.example.h to src/secrets.h and fill in your Wi-Fi and broker"
#endif

// Wi-Fi is normally set from the phone page (saved in flash); secrets.h is only a fallback.
#ifndef WIFI_SSID
#define WIFI_SSID ""
#endif
#ifndef WIFI_PASS
#define WIFI_PASS ""
#endif
// Older secrets.h files (local dev broker) do not define these.
#ifndef MQTT_TLS
#define MQTT_TLS 0
#endif
#ifndef MQTT_USER
#define MQTT_USER ""
#endif
#ifndef MQTT_PASS
#define MQTT_PASS ""
#endif

#if MQTT_TLS
#include <WiFiClientSecure.h>

#include "mqtt_ca.h"
#endif

// ---- Pins ----
#if CONFIG_IDF_TARGET_ESP32C3
const int PINS[4] = {4, 7, 6, 5};  // WW, R, G, B
const int DRV_PIN = 10;            // driver +PWM (via 150 ohm)
#else
const int PINS[4] = {16, 19, 18, 17};  // WW, R, G, B (ESP32 / ESP32-S3)
const int DRV_PIN = 4;                 // driver +PWM (via 150 ohm)
#endif

const bool DRV_INVERTED = true;  // driver opto ON = light kam
const bool DRIVER_ONLY = true;   // sirf driver test: true | RGBW board bhi juda: false

const int COLOR_FREQ = 500;  // PC817 slow hai, 500 Hz
const long MAXD = 1023;      // 10-bit

WebServer server(80);
int level[4] = {255, 0, 0, 0};  // WW R G B (0..255)
int brightness = 100;           // %
int driverDim = 100;            // %
bool lightOn = true;
bool sequential = true;  // true = baari-baari, false = saath

// ---------- Demo sequence ----------
struct Step {
  int ww, r, g, b, bright;
  bool on;
  int ms;
  const char *name;
};
const Step DEMO[] = {
    {255, 0, 0, 0, 100, true, 2500, "Warm white"},
    {0, 255, 0, 0, 100, true, 2500, "Red"},
    {0, 0, 255, 0, 100, true, 2500, "Green"},
    {0, 0, 0, 255, 100, true, 2500, "Blue"},
    {0, 255, 255, 0, 100, true, 2500, "Yellow (R+G)"},
    {0, 255, 0, 255, 100, true, 2500, "Purple (R+B)"},
    {0, 0, 255, 255, 100, true, 2500, "Cyan (G+B)"},
    {0, 255, 255, 255, 100, true, 2500, "RGB white"},
    {255, 0, 0, 0, 60, true, 1500, "Dim 60%"},
    {255, 0, 0, 0, 30, true, 1500, "Dim 30%"},
    {255, 0, 0, 0, 10, true, 1500, "Dim 10%"},
    {255, 0, 0, 0, 100, true, 1500, "Full 100%"},
    {255, 0, 0, 0, 100, false, 2500, "OFF"},
    {255, 0, 0, 0, 100, true, 2500, "ON"},
};
const int DEMO_LEN = sizeof(DEMO) / sizeof(DEMO[0]);
bool demo = false;
int demoStep = 0;
unsigned long demoAt = 0;

// ---------- Blink: 1 s ON, 1 s OFF ----------
const unsigned long BLINK_MS = 1000;
bool blink = false;  // true = boot pe blink shuru, false = boot pe steady ON
unsigned long blinkAt = 0;

void setupLedc() {
  ledc_timer_config_t timer = {};
  timer.speed_mode = LEDC_LOW_SPEED_MODE;
  timer.duty_resolution = LEDC_TIMER_10_BIT;
  timer.clk_cfg = LEDC_AUTO_CLK;
  timer.timer_num = LEDC_TIMER_0;
  timer.freq_hz = COLOR_FREQ;
  ledc_timer_config(&timer);
  timer.timer_num = LEDC_TIMER_1;
  timer.freq_hz = 1000;
  ledc_timer_config(&timer);

  for (int i = 0; i < 5; i++) {
    ledc_channel_config_t channel = {};
    channel.speed_mode = LEDC_LOW_SPEED_MODE;
    channel.channel = (ledc_channel_t)i;
    channel.gpio_num = (i < 4) ? PINS[i] : DRV_PIN;
    channel.timer_sel = (i < 4) ? LEDC_TIMER_0 : LEDC_TIMER_1;
    ledc_channel_config(&channel);
  }
}

void apply() {
  long duty[4] = {0, 0, 0, 0};
  long hpoint[4] = {0, 0, 0, 0};
  const int channelBright = DRIVER_ONLY ? 100 : brightness;
  if (lightOn) {
    if (sequential) {  // ek time pe ek color, total <= 100%
      long sum = level[0] + level[1] + level[2] + level[3];
      long start = 0;
      for (int i = 0; i < 4; i++) {
        if (sum > 0) duty[i] = MAXD * level[i] / sum * channelBright / 100;
        hpoint[i] = start;
        start += duty[i];
      }
    } else {  // saare color ek saath
      for (int i = 0; i < 4; i++) duty[i] = MAXD * level[i] / 255 * channelBright / 100;
    }
  }
  for (int i = 0; i < 4; i++) {
    ledc_set_duty_with_hpoint(LEDC_LOW_SPEED_MODE, (ledc_channel_t)i, duty[i], hpoint[i]);
    ledc_update_duty(LEDC_LOW_SPEED_MODE, (ledc_channel_t)i);
  }

  const int effDrv = lightOn ? (DRIVER_ONLY ? driverDim * brightness / 100 : driverDim) : 0;
  const int drvPct = DRV_INVERTED ? 100 - effDrv : effDrv;
  ledc_set_duty(LEDC_LOW_SPEED_MODE, LEDC_CHANNEL_4, MAXD * drvPct / 100);
  ledc_update_duty(LEDC_LOW_SPEED_MODE, LEDC_CHANNEL_4);

  Serial.printf("%s | WW%d R%d G%d B%d | bright %d%% | driver %d%% (PWM duty %d%%) | %s\n",
                lightOn ? "ON " : "OFF", level[0], level[1], level[2], level[3], brightness,
                effDrv, drvPct, sequential ? "baari-baari" : "saath");
}

void runStep(int index) {
  const Step &step = DEMO[index];
  level[0] = step.ww;
  level[1] = step.r;
  level[2] = step.g;
  level[3] = step.b;
  brightness = step.bright;
  lightOn = step.on;
  Serial.printf("DEMO %d/%d: %s\n", index + 1, DEMO_LEN, step.name);
  apply();
}

// ---------- MQTT (protocol v1, plain MQTT for the bench) ----------
const char *FW_VERSION = "bench-0.2";
const String TOPIC_BASE = String("sl/v1/") + TENANT_ID + "/" + DEVICE_ID + "/";
const unsigned long MQTT_RETRY_MS = 5000;

#if MQTT_TLS
WiFiClientSecure netClient;  // broker certificate checked against MQTT_ROOT_CAS
#else
WiFiClient netClient;
#endif
PubSubClient mqtt(netClient);
unsigned long mqttRetryAt = 0;
unsigned long telemetryAt = 0;
unsigned long telemetryMs = 30000;  // bench: 30 s (production default 300 s)
uint32_t seq = 0;
bool bootEventSent = false;
bool manualActive = false;       // set_output override running
unsigned long manualEndMs = 0;   // millis() when the override ends
unsigned long reportAt = 0;  // phone page se badlav: 1 s baad turant telemetry (0 = kuch nahi)
bool rebootPending = false;
unsigned long rebootAt = 0;
String recentCmdIds[8];  // QoS 1 redelivery: same cmdId = already applied
int recentCmdNext = 0;

uint32_t nowEpoch() {
  time_t now = time(nullptr);
  return now > 1700000000 ? (uint32_t)now : 0;  // 0 = clock not synced yet
}

const char *resetReason() {
  switch (esp_reset_reason()) {
    case ESP_RST_POWERON: return "poweron";
    case ESP_RST_SW: return "software";
    case ESP_RST_PANIC: return "panic";
    case ESP_RST_INT_WDT:
    case ESP_RST_TASK_WDT:
    case ESP_RST_WDT: return "watchdog";
    case ESP_RST_BROWNOUT: return "brownout";
    case ESP_RST_EXT: return "external";
    default: return "other";
  }
}

void publishJson(const char *channel, JsonDocument &doc, bool retained = false) {
  char buf[512];
  size_t len = serializeJson(doc, buf, sizeof(buf));
  String topic = TOPIC_BASE + channel;
  bool ok = mqtt.publish(topic.c_str(), (const uint8_t *)buf, len, retained);
  Serial.printf("MQTT -> %s %s %s\n", topic.c_str(), buf, ok ? "" : "(FAILED)");
}

void sendAck(const char *cmdId, bool accepted, const char *reason = nullptr) {
  JsonDocument doc;
  doc["v"] = 1;
  doc["ts"] = nowEpoch();
  doc["cmdId"] = cmdId;
  doc["status"] = accepted ? "accepted" : "rejected";
  if (reason) doc["reason"] = reason;
  publishJson("cmd/ack", doc);
}

void sendTelemetry() {
  const int effDim = lightOn ? driverDim * brightness / 100 : 0;
  JsonDocument doc;
  doc["v"] = 1;
  doc["ts"] = nowEpoch();
  doc["seq"] = seq++;
  JsonObject lamp = doc["lamp"].to<JsonObject>();
  lamp["on"] = lightOn;
  lamp["dimPercent"] = effDim;
  lamp["mode"] = manualActive ? "manual" : "failsafe";  // bench: no schedule
  JsonObject el = doc["electrical"].to<JsonObject>();     // bench: no sensors fitted
  el["voltageV"] = 0;
  el["currentA"] = 0;
  el["powerW"] = 0;
  el["energyWh"] = 0;
  doc["environment"]["motionDetected"] = false;
  JsonObject dev = doc["device"].to<JsonObject>();
  dev["firmwareVersion"] = FW_VERSION;
  dev["uptimeSec"] = millis() / 1000;
  dev["network"] = "wifi";
  dev["rssiDbm"] = constrain(WiFi.RSSI(), -140, 0);
  publishJson("telemetry", doc);
}

// No schedule on the bench, so "auto" = fail-safe: lamp ON at 100 %.
void returnToAuto() {
  manualActive = false;
  lightOn = true;
  driverDim = 100;
  brightness = 100;
  apply();
}

bool seenCmd(const String &id) {
  for (const String &old : recentCmdIds)
    if (old == id) return true;
  recentCmdIds[recentCmdNext] = id;
  recentCmdNext = (recentCmdNext + 1) % 8;
  return false;
}

void onMqttMessage(char *topic, byte *payload, unsigned int length) {
  Serial.printf("MQTT <- %s %.*s\n", topic, (int)length, (const char *)payload);
  JsonDocument doc;
  if (deserializeJson(doc, payload, length)) return;  // not JSON: no cmdId to ack
  const char *cmdId = doc["cmdId"] | "";
  if (!*cmdId) return;
  if ((doc["v"] | 0) != 1) return sendAck(cmdId, false, "unsupported schema version");

  const uint32_t now = nowEpoch();
  const uint32_t issuedAt = doc["issuedAt"] | 0;
  const uint32_t expiresAt = doc["expiresAt"] | 0;
  if (now && expiresAt && now > expiresAt) return sendAck(cmdId, false, "expired");
  if (seenCmd(cmdId)) return sendAck(cmdId, true);  // already applied

  const String action = doc["action"] | "";
  if (action == "set_output") {
    const uint32_t until = doc["overrideUntil"] | 0;
    uint32_t seconds = until > issuedAt ? until - issuedAt : 0;
    seconds = min(seconds, (uint32_t)7 * 24 * 3600);
    blink = false;
    demo = false;
    lightOn = doc["on"] | true;
    driverDim = constrain((int)(doc["dimPercent"] | 100), 0, 100);
    brightness = 100;
    manualActive = seconds > 0;
    manualEndMs = millis() + seconds * 1000UL;
    apply();
    sendAck(cmdId, true);
    sendTelemetry();
  } else if (action == "set_auto") {
    blink = false;
    demo = false;
    returnToAuto();
    sendAck(cmdId, true);
    sendTelemetry();
  } else if (action == "set_config") {
    int interval = doc["telemetryIntervalSec"] | 0;
    if (interval) telemetryMs = constrain(interval, 30, 3600) * 1000UL;
    sendAck(cmdId, true);
  } else if (action == "reboot") {
    sendAck(cmdId, true);
    rebootPending = true;
    rebootAt = millis() + 3000;
  } else {
    sendAck(cmdId, false, "not supported by bench firmware");  // set_schedule, ota_update
  }
}

void mqttConnect() {
  String willTopic = TOPIC_BASE + "status";
  const char *will = "{\"v\":1,\"ts\":0,\"online\":false}";
  Serial.printf("MQTT connecting to %s:%d%s as %s ...\n", MQTT_HOST, MQTT_PORT,
                MQTT_TLS ? " (TLS)" : "", DEVICE_ID);
  const char *user = MQTT_USER[0] ? MQTT_USER : nullptr;
  const char *pass = MQTT_PASS[0] ? MQTT_PASS : nullptr;
  if (!mqtt.connect(DEVICE_ID, user, pass, willTopic.c_str(), 1, true, will)) {
    // -2 = no TCP/TLS connection (host, port, firewall, certificate); 4/5 = bad credentials
    Serial.printf("MQTT connect failed (state %d), retry in 5 s\n", mqtt.state());
#if MQTT_TLS
    char tlsError[100];
    if (netClient.lastError(tlsError, sizeof(tlsError))) Serial.printf("  TLS: %s\n", tlsError);
#endif
    return;
  }
  Serial.println("MQTT connected");
  mqtt.subscribe((TOPIC_BASE + "cmd").c_str(), 1);

  JsonDocument status;
  status["v"] = 1;
  status["ts"] = nowEpoch();
  status["online"] = true;
  status["firmwareVersion"] = FW_VERSION;
  status["resetReason"] = resetReason();
  publishJson("status", status, true);

  if (!bootEventSent) {
    JsonDocument event;
    event["v"] = 1;
    event["ts"] = nowEpoch();
    event["seq"] = seq++;
    event["type"] = "boot";
    event["severity"] = "info";
    event["message"] = resetReason();
    publishJson("event", event);
    bootEventSent = true;
  }
  sendTelemetry();
  telemetryAt = millis();
}

// ---------- Wi-Fi (router) setup from the phone page, saved in flash (NVS) ----------
Preferences wifiPrefs;
String wifiSsid;
String wifiPass;

// While the ESP32 searches for a router that is not there it hops channels, and phones
// cannot stay on its hotspot. So: try the saved network for 15 s, then pause 60 s with a
// steady hotspot (Wi-Fi can be changed from the page), then try again. No restart: a reboot
// would blink the street light every cycle and the search would start all over again.
const unsigned long WIFI_TRY_MS = 15000;
const unsigned long WIFI_PAUSE_MS = 60000;
unsigned long wifiTryStart = 0;
bool wifiPaused = false;
unsigned long wifiPauseUntil = 0;

void loadWifi() {
  wifiPrefs.begin("wifi", true);
  wifiSsid = wifiPrefs.getString("ssid", "");
  wifiPass = wifiPrefs.getString("pass", "");
  wifiPrefs.end();
  if (wifiSsid.isEmpty()) {  // nothing saved yet: secrets.h fallback (may be empty)
    wifiSsid = WIFI_SSID;
    wifiPass = WIFI_PASS;
  }
}

void connectWifi() {
  if (mqtt.connected()) mqtt.disconnect();
  WiFi.disconnect(false, false);  // router only; the phone hotspot stays up
  if (wifiSsid.isEmpty()) {
    Serial.println("Router Wi-Fi set nahi hai: phone se http://192.168.4.1 kholo -> Wi-Fi setup");
    return;
  }
  WiFi.begin(wifiSsid.c_str(), wifiPass.c_str());
  wifiTryStart = millis();
  wifiPaused = false;
  Serial.printf("Router Wi-Fi '%s' se jud raha hai...\n", wifiSsid.c_str());
}

// Called every loop while the router is not connected.
void watchWifi() {
  if (wifiSsid.isEmpty()) return;
  const unsigned long now = millis();
  const bool phoneOnHotspot = WiFi.softAPgetStationNum() > 0;
  if (!wifiPaused) {
    if (now - wifiTryStart < WIFI_TRY_MS) return;
    WiFi.disconnect(false, false);  // stop searching; hotspot stays on a steady channel
    wifiPaused = true;
    wifiPauseUntil = now + WIFI_PAUSE_MS;
    Serial.printf("Wi-Fi '%s' 15 s mein nahi mila. Hotspot 'SmartLight-RGBW' free hai "
                  "(Wi-Fi badalna ho to badlo); 60 s baad dobara try.\n",
                  wifiSsid.c_str());
    return;
  }
  if ((long)(now - wifiPauseUntil) < 0) return;
  if (phoneOnHotspot) {  // someone may be setting Wi-Fi: do not disturb the hotspot
    wifiPauseUntil = now + 10000;
    return;
  }
  connectWifi();
}

void handleScan() {
  const int found = WiFi.scanNetworks();  // ~2-3 s; ESP32 sees 2.4 GHz only
  JsonDocument doc;
  JsonArray list = doc.to<JsonArray>();
  for (int i = 0; i < found; i++) {
    const String name = WiFi.SSID(i);
    if (name.isEmpty()) continue;  // hidden network
    bool duplicate = false;        // one entry per name (strongest first: scan is sorted)
    for (JsonVariant item : list) duplicate |= item["ssid"] == name;
    if (duplicate) continue;
    JsonObject network = list.add<JsonObject>();
    network["ssid"] = name;
    network["rssi"] = WiFi.RSSI(i);
    network["open"] = WiFi.encryptionType(i) == WIFI_AUTH_OPEN;
  }
  WiFi.scanDelete();
  String body;
  serializeJson(doc, body);  // escapes names safely for the page
  server.send(200, "application/json", body);
}

void handleWifiSave() {
  const String ssid = server.arg("ssid");
  const String pass = server.arg("pass");
  if (ssid.isEmpty() || ssid.length() > 32)
    return server.send(400, "text/plain", "Wi-Fi ka naam 1-32 characters ka hona chahiye");
  if (!pass.isEmpty() && (pass.length() < 8 || pass.length() > 63))
    return server.send(400, "text/plain", "Password 8-63 characters ka hona chahiye");
  wifiPrefs.begin("wifi", false);
  wifiPrefs.putString("ssid", ssid);
  wifiPrefs.putString("pass", pass);
  wifiPrefs.end();
  wifiSsid = ssid;
  wifiPass = pass;
  server.send(200, "text/plain", "Save ho gaya. '" + ssid + "' se jud raha hai...");
  connectWifi();
}

void handleWifiForget() {
  wifiPrefs.begin("wifi", false);
  wifiPrefs.clear();
  wifiPrefs.end();
  wifiSsid = "";
  wifiPass = "";
  server.send(200, "text/plain", "Saved Wi-Fi hata diya");
  connectWifi();
}

void setupMqtt() {
  WiFi.mode(WIFI_AP_STA);  // phone hotspot page + router for MQTT, together
  WiFi.setAutoReconnect(true);
  loadWifi();
  connectWifi();
  configTime(0, 0, "pool.ntp.org", "time.google.com");  // UTC epoch for "ts"
#if MQTT_TLS
  netClient.setCACert(MQTT_ROOT_CAS);
#endif
  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setBufferSize(1024);  // set_schedule commands are larger than the 256 B default
  mqtt.setCallback(onMqttMessage);
  mqtt.setSocketTimeout(5);
}

void loopMqtt() {
  if (manualActive && (long)(millis() - manualEndMs) >= 0) {
    Serial.println("Manual override khatam -> auto (fail-safe ON)");
    returnToAuto();
    if (mqtt.connected()) sendTelemetry();
  }
  if (rebootPending && (long)(millis() - rebootAt) >= 0) ESP.restart();

  static bool wasOnline = false;
  const bool online = WiFi.status() == WL_CONNECTED;
  if (online != wasOnline) {
    wasOnline = online;
    if (online) {
      Serial.printf("Router Wi-Fi juda. ESP32 IP: %s\n", WiFi.localIP().toString().c_str());
    } else {
      Serial.println("Router Wi-Fi nahi juda (SSID/password/2.4 GHz check karo)");
      wifiTryStart = millis();  // lost after being connected: a fresh 15 s window
      wifiPaused = false;
    }
  }
  if (!online) {
    watchWifi();
    return;
  }

  if (!mqtt.connected()) {
#if MQTT_TLS
    // Certificates have validity dates: TLS needs the real time (SNTP) first.
    if (!nowEpoch()) {
      static bool told = false;
      if (!told) Serial.println("TLS ke liye internet time (SNTP) ka intezaar...");
      told = true;
      return;
    }
#endif
    if ((long)(millis() - mqttRetryAt) >= 0) {
      mqttRetryAt = millis() + MQTT_RETRY_MS;
      mqttConnect();
    }
    return;
  }
  mqtt.loop();
  if (reportAt && (long)(millis() - reportAt) >= 0) {
    reportAt = 0;
    telemetryAt = millis();
    sendTelemetry();
  }
  if (millis() - telemetryAt >= telemetryMs) {
    telemetryAt = millis();
    sendTelemetry();
  }
}

String mqttStatusText() {
  if (wifiSsid.isEmpty()) return "Router Wi-Fi: set nahi hai (neeche Wi-Fi setup)";
  if (WiFi.status() != WL_CONNECTED) {
    if (wifiPaused)
      return "Router Wi-Fi '" + wifiSsid + "': nahi mila. Dobara try " +
             String(max(0L, (long)(wifiPauseUntil - millis())) / 1000) +
             " s mein (aap judey hain tab tak ruka rahega)";
    return "Router Wi-Fi '" + wifiSsid + "': dhoondh raha hai...";
  }
  return "Router Wi-Fi '" + wifiSsid + "': juda (" + WiFi.localIP().toString() + ") | MQTT: " +
         (mqtt.connected() ? "juda" : "nahi juda") + " | " + DEVICE_ID +
         (manualActive ? " | manual override" : "");
}

const char PAGE[] PROGMEM = R"HTML(
<!doctype html><meta name=viewport content="width=device-width">
<style>body{font-family:sans-serif;padding:12px}button{font-size:18px;margin:4px;padding:10px 14px}
input[type=range]{width:95%}label{display:block;margin-top:14px}</style>
<h2>SmartLight Test</h2>
<p id=st>...</p>
<button onclick="q('on=1')">ON</button><button onclick="q('on=0')">OFF</button>
<button onclick="q('demo=1')">&#9654; Demo</button><button onclick="q('demo=0')">&#9632; Stop</button>
<button onclick="q('blink=1')">Blink 1s</button><button onclick="q('blink=0')">Blink stop</button>
<label>Brightness <input type=range min=0 max=100 value=100 oninput="q('br='+this.value)"></label>
<label>Driver dim <input type=range min=0 max=100 value=100 oninput="q('drv='+this.value)"></label>
<h3>Color (RGBW board chahiye)</h3>
<button onclick="q('ww=255&r=0&g=0&b=0')">Warm white</button>
<button onclick="q('ww=0&r=255&g=0&b=0')">Red</button>
<button onclick="q('ww=0&r=0&g=255&b=0')">Green</button>
<button onclick="q('ww=0&r=0&g=0&b=255')">Blue</button>
<button onclick="q('ww=0&r=255&g=255&b=0')">Yellow</button>
<button onclick="q('ww=0&r=255&g=0&b=255')">Purple</button>
<button onclick="q('ww=0&r=255&g=255&b=255')">RGB white</button>
<label>Color <input type=color id=c value="#ff0000" oninput="col()"></label>
<label>Warm white <input type=range min=0 max=255 value=255 oninput="q('ww='+this.value)"></label>
<h3>Mixing mode</h3>
<button onclick="q('seq=1')">Baari-baari</button><button onclick="q('seq=0')">Saath</button>
<h3>Wi-Fi setup (router)</h3>
<button onclick="scan()">&#128246; Wi-Fi dhoondho</button>
<label>Wi-Fi <select id=ws onchange="document.getElementById('wn').value=this.value"></select></label>
<label>Naam (SSID) <input id=wn maxlength=32 autocomplete=off></label>
<label>Password <input id=wp type=password maxlength=63 autocomplete=off></label>
<label><input type=checkbox onchange="document.getElementById('wp').type=this.checked?'text':'password'"> Password dikhao</label>
<button onclick="saveWifi()">Save &amp; connect</button><button onclick="forget()">Saved Wi-Fi hatao</button>
<p id=wm></p>
<script>
function q(p){fetch('/set?'+p)}
function st(){fetch('/status').then(r=>r.text()).then(t=>document.getElementById('st').textContent=t)}
st();setInterval(st,3000);
const wm=t=>document.getElementById('wm').textContent=t;
function scan(){wm('Dhoondh raha hai...');fetch('/scan').then(r=>r.json()).then(list=>{
 const s=document.getElementById('ws');s.replaceChildren();
 const first=document.createElement('option');first.value='';first.textContent='-- chuno ('+list.length+') --';s.append(first);
 for(const n of list){const o=document.createElement('option');o.value=n.ssid;
  o.textContent=n.ssid+'  ('+n.rssi+' dBm'+(n.open?', open':'')+')';s.append(o);}
 wm(list.length?'List se apna Wi-Fi chuno':'Koi 2.4 GHz Wi-Fi nahi mila');}).catch(()=>wm('Scan nahi hua, dobara try karo'))}
function saveWifi(){const b=new URLSearchParams({ssid:document.getElementById('wn').value,pass:document.getElementById('wp').value});
 fetch('/wifi',{method:'POST',body:b}).then(r=>r.text()).then(wm).catch(()=>wm('Save ho gaya, board jud raha hai (page ek baar reload karo)'))}
function forget(){if(confirm('Saved Wi-Fi hata dein?'))fetch('/wifi/forget',{method:'POST'}).then(r=>r.text()).then(wm)}
function col(){const h=document.getElementById('c').value;
 q('r='+parseInt(h.substr(1,2),16)+'&g='+parseInt(h.substr(3,2),16)+'&b='+parseInt(h.substr(5,2),16))}
</script>
)HTML";

void handleSet() {
  if (server.hasArg("blink")) {
    blink = server.arg("blink") == "1";
    demo = false;
    lightOn = true;  // blink ON se shuru, stop karne pe light ON rahe
    blinkAt = millis();
    apply();
    server.send(200, "text/plain", "ok");
    return;
  }
  blink = false;  // koi bhi aur control blink rok deta hai
  if (server.hasArg("demo")) {
    demo = server.arg("demo") == "1";
    if (demo) {
      demoStep = 0;
      demoAt = millis();
      runStep(0);
    }
  } else {
    demo = false;  // manual control demo rok deta hai
  }
  if (server.hasArg("ww")) level[0] = constrain(server.arg("ww").toInt(), 0, 255);
  if (server.hasArg("r")) level[1] = constrain(server.arg("r").toInt(), 0, 255);
  if (server.hasArg("g")) level[2] = constrain(server.arg("g").toInt(), 0, 255);
  if (server.hasArg("b")) level[3] = constrain(server.arg("b").toInt(), 0, 255);
  if (server.hasArg("br")) brightness = constrain(server.arg("br").toInt(), 0, 100);
  if (server.hasArg("drv")) driverDim = constrain(server.arg("drv").toInt(), 0, 100);
  if (server.hasArg("on")) lightOn = server.arg("on") == "1";
  if (server.hasArg("seq")) sequential = server.arg("seq") == "1";
  if (!server.hasArg("demo")) apply();
  // Slider har pixel pe request bhejta hai: aakhri badlav ke 1 s baad ek hi report.
  reportAt = millis() + 1000;
  if (!reportAt) reportAt = 1;
  server.send(200, "text/plain", "ok");
}

void setup() {
  Serial.begin(115200);
  setupLedc();
  apply();  // start: 100% (fail-ON)
  WiFi.softAP("SmartLight-RGBW", "test12345");
  Serial.println("Phone se Wi-Fi 'SmartLight-RGBW' jodo, kholo: http://192.168.4.1");
  server.on("/", [] { server.send_P(200, "text/html", PAGE); });
  server.on("/set", handleSet);
  server.on("/status", [] { server.send(200, "text/plain", mqttStatusText()); });
  server.on("/scan", HTTP_GET, handleScan);
  server.on("/wifi", HTTP_POST, handleWifiSave);
  server.on("/wifi/forget", HTTP_POST, handleWifiForget);
  server.begin();
  setupMqtt();
  blinkAt = millis();
}

void loop() {
  server.handleClient();
  loopMqtt();
  if (demo && millis() - demoAt >= (unsigned long)DEMO[demoStep].ms) {
    demoStep = (demoStep + 1) % DEMO_LEN;
    demoAt = millis();
    runStep(demoStep);
  }
  if (blink && millis() - blinkAt >= BLINK_MS) {
    blinkAt += BLINK_MS;  // drift nahi hoga
    lightOn = !lightOn;
    apply();
  }
}
