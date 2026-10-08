import express from "express";
import bcrypt from "bcryptjs";
import { User, SystemLog } from "../models.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = express.Router();
router.use(requireAuth, requireRole("ADMIN"));

router.get("/", async (req, res) => {
  const users = await User.find().select("-password_hash").sort({ created_at: -1 });
  res.json({ users });
});

router.post("/", async (req, res) => {
  const { name, email, password, role = "LAB_ASSISTANT", device_permissions = [] } = req.body || {};
  if (!name || !email || !password) return res.status(400).json({ error: "name, email and password are required" });
  if (!["ADMIN", "LAB_ASSISTANT"].includes(role)) return res.status(400).json({ error: "Invalid role" });

  const exists = await User.findOne({ email: email.toLowerCase() });
  if (exists) return res.status(409).json({ error: "Email already exists" });

  const password_hash = await bcrypt.hash(password, 12);
  const user = await User.create({ name, email: email.toLowerCase(), password_hash, role, device_permissions });
  await SystemLog.create({ action: "USER_CREATED", actor: req.user.email, details: user.email });
  res.status(201).json({ user: { id: user._id, name: user.name, email: user.email, role: user.role, status: user.status, device_permissions: user.device_permissions } });
});

router.put("/:id", async (req, res) => {
  const { name, role, status, device_permissions, password } = req.body || {};
  const update = {};
  if (name) update.name = name;
  if (role && ["ADMIN", "LAB_ASSISTANT"].includes(role)) update.role = role;
  if (status && ["ACTIVE", "DISABLED"].includes(status)) update.status = status;
  if (Array.isArray(device_permissions)) update.device_permissions = device_permissions;
  if (password) update.password_hash = await bcrypt.hash(password, 12);

  const user = await User.findByIdAndUpdate(req.params.id, update, { new: true }).select("-password_hash");
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json({ user });
});

router.delete("/:id", async (req, res) => {
  if (String(req.user._id) === String(req.params.id)) return res.status(400).json({ error: "You cannot delete your own account" });
  const user = await User.findByIdAndDelete(req.params.id);
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json({ message: "User deleted" });
});

export default router;
