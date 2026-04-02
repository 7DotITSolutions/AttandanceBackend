// =============================================================
// FILE: src/middleware/auth.coach.js
// PURPOSE: Protects routes that only a Coach can access.
//          Verifies JWT, checks single-session token, attaches
//          req.coach for use in controllers.
//          Also validates the coach is still active.
// =============================================================

import jwt from "jsonwebtoken";
import Coach from "../models/coach.model.js";
import handleErrors from "./handleErrors.js";

export const authenticateCoach = async (req, res, next) => {
  try {
    // ── Extract token ─────────────────────────────────────
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return next(handleErrors(401, "Access denied. No token provided."));
    }
    const token = authHeader.split(" ")[1];

    // ── Verify token ──────────────────────────────────────
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      return next(handleErrors(401, "Invalid or expired token."));
    }

    // ── Must be coach role ────────────────────────────────
    if (decoded.role !== "coach") {
      return next(handleErrors(403, "Access denied. Coaches only."));
    }

    // ── Find coach and check token matches ────────────────
    const coach = await Coach.findById(decoded.id).select("+currentToken");
    if (!coach) {
      return next(handleErrors(401, "Account not found."));
    }
    if (coach.currentToken !== token) {
      return next(handleErrors(401, "Session expired. Please login again."));
    }
    if (coach.status !== "active") {
      return next(handleErrors(403, "Your account has been deactivated."));
    }

    // ── Attach to request ─────────────────────────────────
    req.coach = coach;
    req.userId = coach._id;
    req.userRole = "coach";
    next();
  } catch (err) {
    next(err);
  }
};