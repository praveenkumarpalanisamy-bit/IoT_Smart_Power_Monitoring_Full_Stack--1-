import express from "express";
import crypto from "crypto";
import { Device } from "../models.js";
import { requireAuth, requireRole, requireDeviceKey } from "../middleware/auth.js";

const router = express.Router();

router.get("/status", requireAuth, async (req, res) => {
  const deviceId = req.query.device_id || "ESP32-001";
  const device = await Device.findOne({ device_id: deviceId }).select("-device_api_key -pending_command");
  res.json({ device });
});

router.get("/", requireAuth, async (req, res) => {
  const devices = await Device.find().select("-device_api_key -pending_command").sort({ created_at: -1 });
  res.json({ devices });
});

router.post("/", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const { device_id, device_name, esp32_ip } = req.body || {};
  if (!device_id || !device_name) return res.status(400).json({ error: "device_id and device_name are required" });

  const device = await Device.create({
    device_id, device_name, esp32_ip,
    device_api_key: crypto.randomBytes(24).toString("hex")
  });
  res.status(201).json({ device: { ...device.toObject(), device_api_key: device.device_api_key } });
});

router.post("/heartbeat", requireDeviceKey, async (req, res) => {
  const { relay_status = false, wifi_rssi, ip_address } = req.body || {};
  const device = await Device.findOneAndUpdate(
    { device_id: req.body.device_id },
    { $set: { status: "ONLINE", last_seen: new Date(), relay_status: Boolean(relay_status), wifi_status: "CONNECTED", wifi_rssi: Number(wifi_rssi) || null, esp32_ip: ip_address || req.device.esp32_ip } },
    { new: true }
  ).select("-device_api_key -pending_command");

  req.app.get("io").emit("device-status", device.toObject());
  res.json({ device });
});

export default router;
