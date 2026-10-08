import dotenv from "dotenv";
dotenv.config();

export const config = {
  port: Number(process.env.PORT || 5000),
  mongoUri: process.env.MONGO_URI || "mongodb://127.0.0.1:27017/smart_power",
  jwtSecret: process.env.JWT_SECRET || "development-only-change-me",
  frontendOrigin: process.env.FRONTEND_ORIGIN || "http://localhost:5000",
  adminEmail: process.env.ADMIN_EMAIL || "admin@example.com",
  adminPassword: process.env.ADMIN_PASSWORD || "Admin@12345",
  demoMode: String(process.env.DEMO_MODE || "true").toLowerCase() === "true"
};
