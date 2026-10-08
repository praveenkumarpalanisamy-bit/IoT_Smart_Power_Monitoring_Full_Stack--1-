import express from "express";
import bcrypt from "bcryptjs";
import { User, SystemLog } from "../models.js";
import { signToken, requireAuth } from "../middleware/auth.js";

const router = express.Router();

router.post("/login", async (req, res) => {
  const { email, username, password } = req.body || {};
  const identity = String(email || username || "").trim().toLowerCase();
  if (!identity || !password) return res.status(400).json({ error: "Email/username and password are required" });

  const user = await User.findOne({ email: identity });
  if (!user || user.status !== "ACTIVE") return res.status(401).json({ error: "Invalid credentials" });

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: "Invalid credentials" });

  const token = signToken(user);
  await SystemLog.create({ action: "LOGIN", actor: user.email, details: "Successful login" });
  res.json({
    token,
    user: { id: user._id, name: user.name, email: user.email, role: user.role, device_permissions: user.device_permissions }
  });
});

router.post("/logout", requireAuth, async (req, res) => {
  await SystemLog.create({ action: "LOGOUT", actor: req.user.email, details: "User logout" });
  res.json({ message: "Logged out" });
});

router.get("/me", requireAuth, (req, res) => {
  res.json({ user: { id: req.user._id, name: req.user.name, email: req.user.email, role: req.user.role, device_permissions: req.user.device_permissions } });
});

export default router;
