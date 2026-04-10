// =============================================================
// FILE: src/controllers/admin/auth.controller.js
// PURPOSE: Admin registration, OTP verify, profile, password
//          reset. All responses return both "admin" and "user"
//          keys so AuthContext reads correctly.
// =============================================================
// =============================================================
// FILE: src/controllers/admin/auth.controller.js
// PURPOSE: Admin registration, OTP verify, profile, password reset.
//
// FIX 1 — Unverified re-registration:
//   If someone registers, doesn't verify, then tries to register
//   again with the same email → old code said "already exists".
//   New logic:
//     - If email found AND isVerified=true  → block (real account)
//     - If email found AND isVerified=false → resend new OTP,
//       update existing record (don't block them)
//
// FIX 2 — Response shape:
//   verifyEmail returns both "user" and "admin" keys so
//   AuthContext reads it correctly regardless of which key it
//   looks for.
// =============================================================

import Admin from "../../models/admin.model.js";
import jwt   from "jsonwebtoken";
import handleErrors         from "../../middleware/handleErrors.js";
import deleteFromCloudinary from "../../middleware/deleteImage.js";
import {
  sendAdminOtp,
  sendPasswordResetOtp,
} from "../../utils/sendEmail.js";

const signToken = (payload) =>
  jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });

const sanitize = (doc) => ({
  _id:        doc._id,
  name:       doc.name,
  email:      doc.email,
  role:       doc.role,
  profile:    doc.profile    || null,
  profile_id: doc.profile_id || null,
});

// ── POST /admin/register ──────────────────────────────────
export const register = async (req, res, next) => {
  try {
    const { name, email, password, role } = req.body;

    if (!name?.trim() || !email?.trim() || !password?.trim()) {
      return next(handleErrors(400, "Name, email and password are required"));
    }
    if (password.length < 8) {
      return next(handleErrors(400, "Password must be at least 8 characters"));
    }

    const normalizedEmail = email.toLowerCase().trim();
    const existing        = await Admin.findOne({ email: normalizedEmail });

    // ── Case 1: Email exists and IS verified → hard block ─
    if (existing && existing.isVerified) {
      return next(
        handleErrors(
          400,
          "An account with this email already exists. Please login or use forgot password."
        )
      );
    }

    const otp    = Math.floor(100000 + Math.random() * 900000).toString();
    const newOtp = { otp, otpCreatedAt: new Date() };

    // ── Case 2: Email exists but NOT verified → resend OTP ─
    if (existing && !existing.isVerified) {
      // Update name, password, role and refresh OTP
      existing.name         = name.trim();
      existing.password     = password; // pre-save will hash
      existing.role         = role === "admin+coach" ? "admin+coach" : "admin";
      existing.otp          = otp;
      existing.otpCreatedAt = new Date();

      await existing.save(); // triggers password hash
      await sendAdminOtp(normalizedEmail, name.trim(), otp);

      return res.status(200).json({
        success: true,
        message: "OTP resent to your email. Please verify to complete registration.",
        resent:  true,
      });
    }

    // ── Case 3: New email → create fresh account ──────────
    const admin = new Admin({
      name:         name.trim(),
      email:        normalizedEmail,
      password,
      role:         role === "admin+coach" ? "admin+coach" : "admin",
      ...newOtp,
      isVerified:   false,
    });

    await admin.save();
    await sendAdminOtp(normalizedEmail, name.trim(), otp);

    return res.status(201).json({
      success: true,
      message: "Registration successful. Check your email for OTP.",
    });
  } catch (err) {
    next(err);
  }
};

// ── POST /admin/verify-email ──────────────────────────────
export const verifyEmail = async (req, res, next) => {
  try {
    const { email, otp } = req.body;

    if (!email?.trim() || !otp?.trim()) {
      return next(handleErrors(400, "Email and OTP are required"));
    }

    const admin = await Admin.findOne({ email: email.toLowerCase().trim() });
    if (!admin) return next(handleErrors(404, "Account not found. Please register."));

    if (admin.isVerified) {
      return next(handleErrors(400, "Email already verified. Please login."));
    }
    if (!admin.otp || admin.otp !== otp.trim()) {
      return next(handleErrors(400, "Invalid OTP. Please check your email."));
    }

    const otpAge = Date.now() - new Date(admin.otpCreatedAt).getTime();
    if (otpAge > 10 * 60 * 1000) {
      return next(
        handleErrors(
          400,
          "OTP has expired. Please register again to get a new OTP."
        )
      );
    }

    const token = signToken({ id: admin._id, role: admin.role });

    admin.isVerified   = true;
    admin.otp          = null;
    admin.otpCreatedAt = null;
    admin.currentToken = token;
    admin.lastLogin    = new Date();
    await admin.save({ validateBeforeSave: false });

    const userData = sanitize(admin);

    return res.status(200).json({
      success: true,
      message: "Email verified! Welcome to AttendancePro.",
      token,
      user:  userData, // AuthContext reads this
      admin: userData, // backward compat
    });
  } catch (err) {
    next(err);
  }
};

// ── POST /admin/logout ────────────────────────────────────
export const logout = async (req, res, next) => {
  try {
    req.admin.currentToken = null;
    await req.admin.save({ validateBeforeSave: false });
    return res.status(200).json({ success: true, message: "Logged out successfully" });
  } catch (err) {
    next(err);
  }
};

// ── GET /admin/profile ────────────────────────────────────
export const getProfile = async (req, res, next) => {
  try {
    const admin = await Admin.findById(req.admin._id);
    if (!admin) return next(handleErrors(404, "Admin not found"));
    return res.status(200).json({ success: true, admin });
  } catch (err) {
    next(err);
  }
};

// ── POST /admin/profile/update ────────────────────────────
export const updateProfile = async (req, res, next) => {
  try {
    const { name } = req.body;
    const admin = await Admin.findById(req.admin._id);
    if (!admin) return next(handleErrors(404, "Admin not found"));

    if (name?.trim()) admin.name = name.trim();

    if (req.file) {
      if (admin.profile_id) await deleteFromCloudinary(admin.profile_id);
      admin.profile    = req.file.path;
      admin.profile_id = req.file.filename;
    }

    await admin.save({ validateBeforeSave: false });
    return res.status(200).json({ success: true, message: "Profile updated", admin });
  } catch (err) {
    next(err);
  }
};

// ── POST /admin/otp-send-password ─────────────────────────
export const sendOtp = async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email?.trim()) return next(handleErrors(400, "Email is required"));

    const admin = await Admin.findOne({ email: email.toLowerCase().trim() });
    if (!admin) {
      return next(handleErrors(404, "No account found with this email"));
    }
    if (!admin.isVerified) {
      return next(
        handleErrors(400, "Account not verified. Please complete registration first.")
      );
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    admin.otp          = otp;
    admin.otpCreatedAt = new Date();
    await admin.save({ validateBeforeSave: false });
    await sendPasswordResetOtp(admin.email, admin.name, otp);

    return res.status(200).json({ success: true, message: "OTP sent to your email" });
  } catch (err) {
    next(err);
  }
};

// ── POST /admin/password-reset ─────────────────────────────
export const resetPassword = async (req, res, next) => {
  try {
    const { email, otp, password } = req.body;

    if (!email?.trim() || !otp?.trim() || !password?.trim()) {
      return next(handleErrors(400, "Email, OTP and new password are required"));
    }
    if (password.length < 8) {
      return next(handleErrors(400, "Password must be at least 8 characters"));
    }

    const admin = await Admin.findOne({ email: email.toLowerCase().trim() });
    if (!admin) return next(handleErrors(404, "Admin not found"));
    if (!admin.otp || admin.otp !== otp.trim()) {
      return next(handleErrors(400, "Invalid OTP"));
    }

    const otpAge = Date.now() - new Date(admin.otpCreatedAt).getTime();
    if (otpAge > 10 * 60 * 1000) {
      return next(handleErrors(400, "OTP expired. Please request a new one."));
    }

    admin.password     = password; // pre-save will hash
    admin.otp          = null;
    admin.otpCreatedAt = null;
    admin.currentToken = null;
    await admin.save(); // full save — triggers hash

    return res.status(200).json({
      success: true,
      message: "Password reset successful. Please login with your new password.",
    });
  } catch (err) {
    next(err);
  }
};