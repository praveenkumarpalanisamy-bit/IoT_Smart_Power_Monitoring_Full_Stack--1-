import express from "express";
import { SensorReading, Device, Alert } from "../models.js";
import { requireAuth, requireDeviceKey } from "../middleware/auth.js";

const router = express.Router();

function finiteNumber(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

router.post("/", requireDeviceKey, async (req, res) => {
  const { device_id } = req.body;
  const voltage = finiteNumber(req.body.voltage);
  const current = Math.max(0, finiteNumber(req.body.current));
  const power = Math.max(0, finiteNumber(req.body.power, voltage * current));
  const energy = Math.max(0, finiteNumber(req.body.energy));
  const relayStatus = Boolean(req.body.relay_status);

  if (voltage < 0 || voltage > 1000 || current > 100 || power > 100000 || energy > 10000000) {
    return res.status(400).json({ error: "Sensor value outside accepted range" });
  }

  const reading = await SensorReading.create({
    device_id, voltage, current, power, energy, relay_status: relayStatus
  });

  await Device.updateOne({ device_id }, {
    $set: {
      status: "ONLINE",
      last_seen: new Date(),
      relay_status: relayStatus,
      sensor_status: "OK"
    }
  });

  const socket = req.app.get("io");
  socket.emit("sensor-update", reading.toObject());

  if (current > 10) {
    const alert = await Alert.create({
      device_id, alert_type: "OVER_CURRENT", value: current, severity: "CRITICAL"
    });
    socket.emit("alert-created", alert.toObject());
  }

  res.status(201).json({ message: "Sensor data stored", reading });
});

router.get("/latest", requireAuth, async (req, res) => {
  const deviceId = req.query.device_id || "ESP32-001";
  const reading = await SensorReading.findOne({ device_id: deviceId }).sort({ timestamp: -1 });
  res.json({ reading });
});

router.get("/history", requireAuth, async (req, res) => {
  const deviceId = req.query.device_id || "ESP32-001";
  const from = req.query.from ? new Date(req.query.from) : new Date(Date.now() - 24 * 3600 * 1000);
  const to = req.query.to ? new Date(req.query.to) : new Date();
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return res.status(400).json({ error: "Invalid date range" });

  const rows = await SensorReading.find({ device_id: deviceId, timestamp: { $gte: from, $lte: to } })
    .sort({ timestamp: 1 }).limit(5000);
  res.json({ readings: rows });
});

export default router;
