# MongoDB schema

## users

```json
{
  "name": "Lab Assistant",
  "email": "assistant@example.com",
  "password_hash": "bcrypt hash",
  "role": "LAB_ASSISTANT",
  "status": "ACTIVE",
  "device_permissions": ["ESP32-001"],
  "created_at": "ISODate"
}
```

## devices

```json
{
  "device_id": "ESP32-001",
  "device_name": "Main Lab ESP32",
  "esp32_ip": "192.168.1.50",
  "device_api_key": "secret",
  "status": "ONLINE",
  "wifi_status": "CONNECTED",
  "wifi_rssi": -55,
  "last_seen": "ISODate",
  "relay_status": true,
  "sensor_status": "OK",
  "pending_command": {
    "command": "OFF",
    "command_id": "uuid",
    "created_at": "ISODate"
  }
}
```

## sensorreadings

Stores voltage, current, power, energy, relay state and timestamp.

## relayevents

Stores each relay command and the user/device actor.

## alerts

Stores over-current, over-voltage, abnormal power, offline and sensor/communication alerts.

## systemlogs

Stores login, logout, user-management and system actions.
