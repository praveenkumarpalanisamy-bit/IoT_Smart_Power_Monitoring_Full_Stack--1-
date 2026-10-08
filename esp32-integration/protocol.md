# ESP32 API protocol

Base URL:

```text
http://YOUR_SERVER:5000
```

Device authentication:

```text
X-Device-Key: YOUR_DEVICE_API_KEY
```

## Upload sensor data

POST `/api/sensor-data`

```json
{
  "device_id": "ESP32-001",
  "voltage": 230.0,
  "current": 2.5,
  "power": 575.0,
  "energy": 0.25,
  "relay_status": true
}
```

## Heartbeat

POST `/api/device/heartbeat`

```json
{
  "device_id": "ESP32-001",
  "relay_status": true,
  "wifi_rssi": -55,
  "ip_address": "192.168.1.50"
}
```

## Poll relay command

GET `/api/relay/pending?device_id=ESP32-001`

Possible response:

```json
{"command":"ON","command_id":"uuid"}
```

or:

```json
{"command":null}
```

## Acknowledge relay command

POST `/api/relay/ack`

```json
{
  "device_id": "ESP32-001",
  "command_id": "uuid",
  "relay_status": true
}
```

The browser uses Socket.IO for immediate dashboard updates. ESP32 uses HTTP polling for command reliability.
