import express from "express";
import crypto from "crypto";
import { Device, RelayEvent } from "../models.js";
import { requireAuth, requireRole, requireDeviceKey } from "../middleware/auth.js";

const router = express.Router();

async function setRelay(req, res, desired) {
  const { device_id } = req.body || {};
  if (!device_id) return res.status(400).json({ error: "device_id is required" });

  const device = await Device.findOne({ device_id });
  if (!device) return res.status(404).json({ error: "Device not found" });

  if (req.user.role === "LAB_ASSISTANT" && !req.user.device_permissions.includes(device_id)) {
    return res.status(403).json({ error: "You are not authorized for this device" });
  }

  const commandId = crypto.randomUUID();
  await Device.updateOne({ device_id }, {
    $set: { pending_command: { command: desired ? "ON" : "OFF", command_id: commandId, created_at: new Date() } }
  });

  await RelayEvent.create({ device_id, relay_status: desired, changed_by: req.user.email });
  req.app.get("io").emit("relay-command", { device_id, command: desired ? "ON" : "OFF", command_id: commandId });

  res.json({ message: `Relay ${desired ? "ON" : "OFF"} command queued`, command_id: commandId });
}

router.get("/status", requireAuth, async (req, res) => {
  const device = await Device.findOne({ device_id: req.query.device_id || "ESP32-001" }).select("device_id relay_status status last_seen");
  res.json({ relay_status: device?.relay_status ?? false, device });
});

router.post("/on", requireAuth, (req, res) => setRelay(req, res, true));
router.post("/off", requireAuth, (req, res) => setRelay(req, res, false));

router.get("/pending", requireDeviceKey, async (req, res) => {
  const command = req.device.pending_command;
  res.json(command ? { command: command.command, command_id: command.command_id } : { command: null });
});

router.post("/ack", requireDeviceKey, async (req, res) => {
  const { command_id, relay_status } = req.body || {};
  if (!command_id) return res.status(400).json({ error: "command_id required" });

  const pending = req.device.pending_command;
  if (!pending || pending.command_id !== command_id) return res.status(409).json({ error: "Unknown command" });

  await Device.updateOne({ device_id: req.device.device_id }, { $set: { relay_status: Boolean(relay_status), last_seen: new Date() }, $unset: { pending_command: 1 } });
  req.app.get("io").emit("relay-status", { device_id: req.device.device_id, relay_status: Boolean(relay_status) });
  res.json({ message: "Relay command acknowledged" });
});

export default router;
