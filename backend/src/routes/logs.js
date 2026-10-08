import express from "express";
import { SystemLog } from "../models.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = express.Router();

router.get("/", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const logs = await SystemLog.find().sort({ timestamp: -1 }).limit(300);
  res.json({ logs });
});

export default router;
