import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import http from "http";
import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { Server } from "socket.io";

import { config } from "./config.js";
import { User, Device, SensorReading, SystemLog } from "./models.js";
import authRoutes from "./routes/auth.js";
import sensorRoutes from "./routes/sensors.js";
import deviceRoutes from "./routes/devices.js";
import relayRoutes from "./routes/relay.js";
import alertRoutes from "./routes/alerts.js";
import userRoutes from "./routes/users.js";
import logRoutes from "./routes/logs.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendDir = path.resolve(__dirname, "../../frontend");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: config.frontendOrigin, methods: ["GET", "POST"] }
});
app.set("io", io);

app.use(cors({ origin: config.frontendOrigin === "*" ? true : config.frontendOrigin }));
app.use(express.json({ limit: "100kb" }));

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 50, standardHeaders: true, legacyHeaders: false });
app.use("/api/auth/login", loginLimiter);

app.get("/api/health", (req, res) => res.json({ ok: true, service: "smart-power-api", time: new Date().toISOString() }));

app.use("/api/auth", authRoutes);
app.use("/api/sensor-data", sensorRoutes);
app.use("/api/device", deviceRoutes);
app.use("/api/relay", relayRoutes);
app.use("/api/alerts", alertRoutes);
app.use("/api/users", userRoutes);
app.use("/api/logs", logRoutes);

if (fs.existsSync(frontendDir)) {
  app.use(express.static(frontendDir));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api/")) return next();
    res.sendFile(path.join(frontendDir, "index.html"));
  });
}

io.on("connection", socket => {
  socket.emit("server-status", { connected: true, time: new Date().toISOString() });
});

async function ensureAdmin() {
  const existing = await User.findOne({ email: config.adminEmail.toLowerCase() });
  if (!existing) {
    const password_hash = await bcrypt.hash(config.adminPassword, 12);
    await User.create({
      name: "System Administrator",
      email: config.adminEmail.toLowerCase(),
      password_hash,
      role: "ADMIN",
      status: "ACTIVE"
    });
    console.log(`Created admin account: ${config.adminEmail}`);
  }
}

async function ensureDemoDevice() {
  const exists = await Device.findOne({ device_id: "ESP32-001" });
  if (!exists) {
    await Device.create({
      device_id: "ESP32-001",
      device_name: "Main Lab ESP32",
      device_api_key: "CHANGE_ME_DEVICE_KEY_ESP32_001",
      status: "OFFLINE",
      sensor_status: "UNKNOWN"
    });
    console.log("Created demo device ESP32-001.");
    console.log("Change its device_api_key before real deployment.");
  }
}

async function start() {
  await mongoose.connect(config.mongoUri);
  await ensureAdmin();
  await ensureDemoDevice();

  server.listen(config.port, () => {
    console.log(`Smart Power server running at http://localhost:${config.port}`);
  });
}

start().catch(error => {
  console.error("Server startup failed:", error);
  process.exit(1);
});
