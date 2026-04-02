// =============================================================
// FILE: src/middleware/auth.both.js
// PURPOSE: Allows EITHER an Admin or a Coach to access a route.
//          Used for shared endpoints like attendance marking
//          and fee collection where both roles have access
//          but scoped to their own data.
//          Attaches req.user = { id, role, adminId } for
//          controllers to use without caring who called them.
// =============================================================

import jwt from "jsonwebtoken";
import Admin from "../models/admin.model.js";
import Coach from "../models/coach.model.js";
import handleErrors from "./handleErrors.js";

export const authenticateBoth = async (req, res, next) => {
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

    const role = decoded.role;

    // ── Admin path ────────────────────────────────────────
    if (role === "admin" || role === "admin+coach") {
      const admin = await Admin.findById(decoded.id).select("+currentToken");
      if (!admin) return next(handleErrors(401, "Account not found."));
      if (admin.currentToken !== token) {
        return next(handleErrors(401, "Session expired. Please login again."));
      }
      req.user = {
        id:      admin._id,
        role:    admin.role,
        adminId: admin._id,   // admin IS the institution owner
        name:    admin.name,
        model:   "Admin",
      };
      req.admin = admin;
      return next();
    }

    // ── Coach path ────────────────────────────────────────
    if (role === "coach") {
      const coach = await Coach.findById(decoded.id).select("+currentToken");
      if (!coach) return next(handleErrors(401, "Account not found."));
      if (coach.currentToken !== token) {
        return next(handleErrors(401, "Session expired. Please login again."));
      }
      if (coach.status !== "active") {
        return next(handleErrors(403, "Your account has been deactivated."));
      }
      req.user = {
        id:      coach._id,
        role:    "coach",
        adminId: coach.adminId,  // coach belongs to this admin's institution
        name:    coach.name,
        model:   "Coach",
      };
      req.coach = coach;
      return next();
    }

    return next(handleErrors(403, "Access denied. Invalid role."));
  } catch (err) {
    next(err);
  }
};