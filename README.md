# IoT Based Smart Power Monitoring and Control System

A complete engineering-project-ready full-stack IoT application.

## Architecture

ESP32-WROOM / AT89S52
→ REST API
→ Node.js + Express
→ MongoDB
→ Socket.IO
→ Responsive Web Dashboard

The ESP32 integration is modular. The backend accepts sensor data and heartbeats and exposes authenticated relay-control endpoints.

## Project structure

```text
iot-smart-power-system/
├── frontend/
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── backend/
│   ├── package.json
│   ├── .env.example
│   └── src/
│       ├── server.js
│       ├── config.js
│       ├── middleware/auth.js
│       ├── models.js
│       ├── routes/auth.js
│       ├── routes/sensors.js
│       ├── routes/devices.js
│       ├── routes/relay.js
│       ├── routes/alerts.js
│       ├── routes/users.js
│       └── routes/logs.js
├── database/
│   └── schema.md
├── esp32-integration/
│   ├── esp32_client.ino
│   └── protocol.md
└── README.md
```

## Requirements

- Node.js 18+
- MongoDB 6+ (local or MongoDB Atlas)
- Arduino IDE for ESP32 firmware
- Modern Chrome/Edge/Firefox

## 1. Backend setup

```bash
cd backend
npm install
copy .env.example .env
```

Linux/macOS:

```bash
cp .env.example .env
```

Edit `.env`:

```env
PORT=5000
MONGO_URI=mongodb://127.0.0.1:27017/smart_power
JWT_SECRET=replace_with_a_long_random_secret
FRONTEND_ORIGIN=http://localhost:5500
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=Admin@12345
DEMO_MODE=true
```

Start:

```bash
npm run dev
```

or:

```bash
npm start
```

The backend serves the frontend automatically at:

```text
http://localhost:5000
```

On first start, the default admin account is created from `ADMIN_EMAIL` and `ADMIN_PASSWORD`.

## 2. Frontend

The easiest method is to let Express serve `frontend/`.

If you want a separate static server:

```bash
cd frontend
python -m http.server 5500
```

Then set:

```env
FRONTEND_ORIGIN=http://localhost:5500
```

and change `API_BASE` in `frontend/app.js` if required.

## 3. Demo Mode

Login with the configured admin credentials.

Enable Demo Mode from Settings. Demo mode generates clearly labelled sample values. It never presents those values as real ESP32 measurements.

When Demo Mode is enabled, relay controls are local simulation controls.

When Demo Mode is disabled and the ESP32/device is offline, relay controls are disabled and the dashboard keeps the last real value with its timestamp.

## 4. Roles

### ADMIN

- Dashboard
- Live monitoring
- History
- Relay control
- Alerts
- Devices
- User management
- Logs
- Settings

### LAB_ASSISTANT

- Dashboard
- Live monitoring
- History
- Authorized relay control
- Alerts
- Device view

Lab assistants cannot manage users or system logs.

## 5. API

### Authentication

```http
POST /api/auth/login
POST /api/auth/logout
GET  /api/auth/me
```

### Sensor data

```http
POST /api/sensor-data
GET  /api/sensor-data/latest?device_id=ESP32-001
GET  /api/sensor-data/history?device_id=ESP32-001&from=...&to=...
```

ESP32 sensor upload uses the device API key:

```http
X-Device-Key: <device_api_key>
```

Body:

```json
{
  "device_id": "ESP32-001",
  "voltage": 230.2,
  "current": 2.15,
  "power": 494.93,
  "energy": 1.284
}
```

### Device

```http
GET  /api/device/status?device_id=ESP32-001
POST /api/device/heartbeat
```

Heartbeat:

```json
{
  "device_id": "ESP32-001",
  "relay_status": true,
  "wifi_rssi": -58,
  "ip_address": "192.168.1.50"
}
```

### Relay

Browser/admin requests use JWT:

```http
GET  /api/relay/status?device_id=ESP32-001
POST /api/relay/on
POST /api/relay/off
```

Body:

```json
{
  "device_id": "ESP32-001"
}
```

The backend emits a Socket.IO `relay-command` event and also stores the relay event.

The ESP32 should poll:

```http
GET /api/relay/pending?device_id=ESP32-001
```

using `X-Device-Key`. It returns:

```json
{
  "command": "ON",
  "command_id": "..."
}
```

After applying it, ESP32 confirms:

```http
POST /api/relay/ack
X-Device-Key: <device_api_key>

{
  "device_id": "ESP32-001",
  "command_id": "...",
  "relay_status": true
}
```

This polling approach is deliberately used for ESP32 command delivery because it works reliably even when the ESP32 is behind NAT. Socket.IO remains the browser real-time channel.

## 6. Database

MongoDB collections:

- users
- devices
- sensorreadings
- relayevents
- alerts
- systemlogs

See `database/schema.md`.

## 7. Security

- Passwords are bcrypt hashed.
- JWT authentication is used for dashboard sessions.
- Role checks protect admin-only APIs.
- Device APIs require device API keys.
- Secrets are environment variables.
- Validation rejects invalid sensor values.
- CORS is restricted to configured frontend origin.
- Database credentials are never stored in source code.

For production, also use HTTPS, rotate JWT/device secrets, rate limiting, secure cookies, and a reverse proxy.

## 8. ESP32 connection

Install these Arduino libraries:

- WiFi
- HTTPClient
- ArduinoJson

Edit:

```cpp
WIFI_SSID
WIFI_PASSWORD
API_BASE
DEVICE_ID
DEVICE_API_KEY
```

The sample reads voltage/current from placeholder functions. Replace those functions with your actual ADC0804/AT89S52 serial protocol or direct ESP32 sensor interface.

The sample demonstrates:

1. Wi-Fi connection
2. Sensor upload
3. Heartbeat
4. Relay command polling
5. Relay acknowledgement

## 9. AT89S52 integration

Recommended project data flow:

```text
ACS712 + Voltage Sensor
        ↓
     ADC0804
        ↓
     AT89S52
        ↓ UART
     ESP32-WROOM
        ↓ Wi-Fi
Node.js REST API
        ↓
MongoDB + Socket.IO
        ↓
Web Dashboard
```

The ESP32 firmware should receive the measured values from AT89S52 over UART and forward them to `/api/sensor-data`.

## 10. Testing procedure

1. Start MongoDB.
2. Start backend.
3. Open dashboard.
4. Login.
5. Confirm dashboard loads.
6. Enable Demo Mode and verify charts.
7. Create a lab assistant.
8. Verify the assistant cannot access Users/Logs.
9. Register/create a device with a device key.
10. Run ESP32 firmware.
11. Send sensor data.
12. Verify live values update without page refresh.
13. Toggle relay.
14. Verify ESP32 receives the command.
15. Verify relay event appears in history.
16. Disconnect ESP32 and confirm Device Offline.
17. Confirm relay controls become disabled when not in Demo Mode.
18. Test alert acknowledgement.

## 11. Production deployment

Backend can be deployed on Render, Railway, Fly.io, AWS, Azure, or a VPS. MongoDB can be MongoDB Atlas.

Set production environment variables and use HTTPS.

The frontend can also be served from the Express backend, or hosted on a static host with `API_BASE` configured to the backend URL.

## Default demonstration account

The values are controlled by `.env`:

```text
Email: admin@example.com
Password: Admin@12345
```

Change these before deployment.
