import mongoose from "mongoose";

const { Schema } = mongoose;

const userSchema = new Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password_hash: { type: String, required: true },
  role: { type: String, enum: ["ADMIN", "LAB_ASSISTANT"], default: "LAB_ASSISTANT" },
  status: { type: String, enum: ["ACTIVE", "DISABLED"], default: "ACTIVE" },
  device_permissions: [{ type: String }],
  created_at: { type: Date, default: Date.now }
});

const deviceSchema = new Schema({
  device_id: { type: String, required: true, unique: true, index: true },
  device_name: { type: String, required: true },
  esp32_ip: String,
  device_api_key: { type: String, required: true },
  status: { type: String, enum: ["ONLINE", "OFFLINE"], default: "OFFLINE" },
  wifi_status: { type: String, default: "UNKNOWN" },
  wifi_rssi: Number,
  last_seen: Date,
  relay_status: { type: Boolean, default: false },
  sensor_status: { type: String, default: "UNKNOWN" },
  pending_command: {
    command: String,
    command_id: String,
    created_at: Date
  },
  created_at: { type: Date, default: Date.now }
});

const sensorReadingSchema = new Schema({
  device_id: { type: String, required: true, index: true },
  voltage: { type: Number, required: true },
  current: { type: Number, required: true },
  power: { type: Number, required: true },
  energy: { type: Number, required: true },
  relay_status: { type: Boolean, default: false },
  timestamp: { type: Date, default: Date.now, index: true }
});

const relayEventSchema = new Schema({
  device_id: { type: String, required: true, index: true },
  relay_status: { type: Boolean, required: true },
  changed_by: { type: String, required: true },
  timestamp: { type: Date, default: Date.now }
});

const alertSchema = new Schema({
  device_id: { type: String, required: true, index: true },
  alert_type: { type: String, required: true },
  value: { type: Number, default: null },
  severity: { type: String, enum: ["INFO", "WARNING", "CRITICAL"], default: "WARNING" },
  status: { type: String, enum: ["OPEN", "ACKNOWLEDGED", "CLEARED"], default: "OPEN" },
  timestamp: { type: Date, default: Date.now }
});

const systemLogSchema = new Schema({
  action: String,
  actor: String,
  details: String,
  timestamp: { type: Date, default: Date.now, index: true }
});

export const User = mongoose.model("User", userSchema);
export const Device = mongoose.model("Device", deviceSchema);
export const SensorReading = mongoose.model("SensorReading", sensorReadingSchema);
export const RelayEvent = mongoose.model("RelayEvent", relayEventSchema);
export const Alert = mongoose.model("Alert", alertSchema);
export const SystemLog = mongoose.model("SystemLog", systemLogSchema);
