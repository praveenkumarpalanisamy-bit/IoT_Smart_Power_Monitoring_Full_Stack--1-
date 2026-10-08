import jwt from "jsonwebtoken";
import { config } from "../config.js";
import { User, Device } from "../models.js";

export function signToken(user) {
  return jwt.sign(
    { id: user._id.toString(), role: user.role, email: user.email, name: user.name },
    config.jwtSecret,
    { expiresIn: "8h" }
  );
}

export async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    if (!header.startsWith("Bearer ")) return res.status(401).json({ error: "Authentication required" });
    const payload = jwt.verify(header.slice(7), config.jwtSecret);
    const user = await User.findById(payload.id);
    if (!user || user.status !== "ACTIVE") return res.status(401).json({ error: "Account unavailable" });
    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) return res.status(403).json({ error: "Insufficient permissions" });
    next();
  };
}

export async function requireDeviceKey(req, res, next) {
  const key = req.headers["x-device-key"];
  const deviceId = req.body?.device_id || req.query?.device_id;
  if (!key || !deviceId) return res.status(401).json({ error: "Device credentials required" });
  const device = await Device.findOne({ device_id: deviceId, device_api_key: key });
  if (!device) return res.status(401).json({ error: "Invalid device credentials" });
  req.device = device;
  next();
}
