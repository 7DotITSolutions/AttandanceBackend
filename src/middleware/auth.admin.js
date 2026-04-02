// =============================================================
// FILE: src/middleware/auth.admin.js
// PURPOSE: Protects routes that only an Admin (or Admin+Coach)
//          can access. Verifies JWT, checks token matches the
//          stored currentToken (single-session), attaches
//          req.admin for use in controllers.
// =============================================================

import jwt from "jsonwebtoken";
import Admin from "../models/admin.model.js";
import handleErrors from "./handleErrors.js";

export const authenticateAdmin = async (req, res, next) => {
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

    // ── Must be admin role ────────────────────────────────
    if (decoded.role !== "admin" && decoded.role !== "admin+coach") {
      return next(handleErrors(403, "Access denied. Admins only."));
    }

    // ── Find admin and check token matches ────────────────
    const admin = await Admin.findById(decoded.id).select("+currentToken");
    if (!admin) {
      return next(handleErrors(401, "Account not found."));
    }
    if (admin.currentToken !== token) {
      return next(handleErrors(401, "Session expired. Please login again."));
    }

    // ── Attach to request ─────────────────────────────────
    req.admin = admin;
    req.userId = admin._id;
    req.userRole = admin.role;
    next();
  } catch (err) {
    next(err);
  }
};