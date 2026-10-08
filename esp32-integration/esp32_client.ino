/*
  IoT Smart Power Monitoring - ESP32 Client
  Replace the sensor-reading functions with your actual
  ADC0804/AT89S52 UART data parsing.

  Required Arduino libraries:
  WiFi, HTTPClient, ArduinoJson
*/

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

const char* WIFI_SSID = "YOUR_WIFI";
const char* WIFI_PASSWORD = "YOUR_PASSWORD";

const char* API_BASE = "http://192.168.1.100:5000";
const char* DEVICE_ID = "ESP32-001";
const char* DEVICE_API_KEY = "CHANGE_ME_DEVICE_KEY_ESP32_001";

const int RELAY_PIN = 2;

bool relayState = false;
unsigned long lastUpload = 0;
unsigned long lastHeartbeat = 0;
unsigned long lastCommandPoll = 0;

float readVoltage() {
  // TODO: replace with actual voltage-sensor/AT89S52 UART value.
  return 230.0;
}

float readCurrent() {
  // TODO: replace with actual ACS712/ADC0804/AT89S52 value.
  return relayState ? 2.10 : 0.0;
}

float readPower(float voltage, float current) {
  return voltage * current;
}

float readEnergy() {
  // TODO: replace with actual accumulated energy calculation.
  static float energy = 0.0;
  energy += readPower(readVoltage(), readCurrent()) / 3600000.0;
  return energy;
}

void applyRelay(bool on) {
  relayState = on;
  digitalWrite(RELAY_PIN, on ? HIGH : LOW);
}

bool postJson(const String& url, const String& payload, String* response = nullptr) {
  if (WiFi.status() != WL_CONNECTED) return false;

  HTTPClient http;
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Key", DEVICE_API_KEY);

  int code = http.POST(payload);
  if (response) *response = http.getString();
  http.end();

  return code >= 200 && code < 300;
}

void uploadSensorData() {
  float voltage = readVoltage();
  float current = readCurrent();
  float power = readPower(voltage, current);
  float energy = readEnergy();

  StaticJsonDocument<512> doc;
  doc["device_id"] = DEVICE_ID;
  doc["voltage"] = voltage;
  doc["current"] = current;
  doc["power"] = power;
  doc["energy"] = energy;
  doc["relay_status"] = relayState;

  String body;
  serializeJson(doc, body);

  postJson(String(API_BASE) + "/api/sensor-data", body);
}

void sendHeartbeat() {
  StaticJsonDocument<256> doc;
  doc["device_id"] = DEVICE_ID;
  doc["relay_status"] = relayState;
  doc["wifi_rssi"] = WiFi.RSSI();
  doc["ip_address"] = WiFi.localIP().toString();

  String body;
  serializeJson(doc, body);

  postJson(String(API_BASE) + "/api/device/heartbeat", body);
}

void pollRelayCommand() {
  if (WiFi.status() != WL_CONNECTED) return;

  HTTPClient http;
  String url = String(API_BASE) + "/api/relay/pending?device_id=" + DEVICE_ID;
  http.begin(url);
  http.addHeader("X-Device-Key", DEVICE_API_KEY);

  int code = http.GET();
  if (code == 200) {
    String response = http.getString();

    StaticJsonDocument<256> doc;
    if (deserializeJson(doc, response) == DeserializationError::Ok) {
      const char* command = doc["command"];
      const char* commandId = doc["command_id"];

      if (command && commandId) {
        bool requested = String(command) == "ON";
        applyRelay(requested);

        StaticJsonDocument<256> ack;
        ack["device_id"] = DEVICE_ID;
        ack["command_id"] = commandId;
        ack["relay_status"] = relayState;

        String body;
        serializeJson(ack, body);
        postJson(String(API_BASE) + "/api/relay/ack", body);
      }
    }
  }

  http.end();
}

void connectWiFi() {
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  Serial.print("Connecting to Wi-Fi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println();
  Serial.print("IP: ");
  Serial.println(WiFi.localIP());
}

void setup() {
  Serial.begin(115200);
  pinMode(RELAY_PIN, OUTPUT);
  applyRelay(false);
  connectWiFi();
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
  }

  unsigned long now = millis();

  if (now - lastUpload >= 5000) {
    lastUpload = now;
    uploadSensorData();
  }

  if (now - lastHeartbeat >= 10000) {
    lastHeartbeat = now;
    sendHeartbeat();
  }

  if (now - lastCommandPoll >= 2000) {
    lastCommandPoll = now;
    pollRelayCommand();
  }

  delay(20);
}
