// =============================================================
// FILE: src/server.js
// PURPOSE: Express entry point. Connects MongoDB, mounts all
//          routes, handles global errors. This is the final
//          version with all routes active.
// =============================================================

import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import "express-async-errors";

import authRouter  from "./routes/auth.routes.js";
import adminRouter from "./routes/admin.routes.js";
import coachRouter from "./routes/coach.routes.js";

dotenv.config();

const app = express();

// ── Middleware ────────────────────────────────────────────
app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:5173",
  credentials: true,
}));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// ── Health check ──────────────────────────────────────────
app.get("/", (req, res) => {
  res.json({ success: true, message: "Attendance Pro API running" });
});

// ── Routes ────────────────────────────────────────────────
app.use("/auth",  authRouter);
app.use("/admin", adminRouter);
app.use("/coach", coachRouter);

// ── 404 handler ───────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: "Route not found" });
});

// ── Global error handler ──────────────────────────────────
app.use((err, req, res, next) => {
  const status  = err.status || err.statusCode || 500;
  const message = err.message || "Internal server error";
  if (status === 500) console.error("Server error:", err);
  res.status(status).json({ success: false, message });
});

// ── Connect DB then start server ──────────────────────────
const PORT = process.env.PORT || 5000;

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log("✅ MongoDB connected");
    app.listen(PORT, () =>
      console.log(`🚀 Server running on http://localhost:${PORT}`)
    );
  })
  .catch((err) => {
    console.error("❌ MongoDB connection failed:", err.message);
    process.exit(1);
  });