import express from "express";
import { Alert } from "../models.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = express.Router();

router.get("/", requireAuth, async (req, res) => {
  const rows = await Alert.find({ device_id: req.query.device_id || "ESP32-001" }).sort({ timestamp: -1 }).limit(200);
  res.json({ alerts: rows });
});

router.post("/:id/acknowledge", requireAuth, async (req, res) => {
  const row = await Alert.findByIdAndUpdate(req.params.id, { status: "ACKNOWLEDGED" }, { new: true });
  if (!row) return res.status(404).json({ error: "Alert not found" });
  req.app.get("io").emit("alert-updated", row.toObject());
  res.json({ alert: row });
});

router.post("/:id/clear", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const row = await Alert.findByIdAndUpdate(req.params.id, { status: "CLEARED" }, { new: true });
  if (!row) return res.status(404).json({ error: "Alert not found" });
  req.app.get("io").emit("alert-updated", row.toObject());
  res.json({ alert: row });
});

export default router;
