// =============================================================
// FILE: src/controllers/auth/unified.auth.controller.js
// PURPOSE: Single POST /auth/login endpoint for ALL users.
//          Checks Admin collection first, then Coach collection.
//          Admin → direct login with email+password.
//          Coach (first login) → sends OTP, returns flag.
//          Coach (returning) → direct login with email+password.
//          POST /auth/verify-coach-email → verifies first-login OTP.
// =============================================================

import Admin from "../../models/admin.model.js";
import Coach from "../../models/coach.model.js";
import jwt from "jsonwebtoken";
import handleErrors from "../../middleware/handleErrors.js";
import { sendCoachVerificationOtp } from "../../utils/sendEmail.js";

// ── Sign JWT ──────────────────────────────────────────────
const signToken = (payload) =>
  jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });

// ── POST /auth/login ──────────────────────────────────────
export const unifiedLogin = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email?.trim() || !password?.trim()) {
      return next(handleErrors(400, "Email and password are required"));
    }
    const normalizedEmail = email.toLowerCase().trim();

    // ── 1. Check Admin first ──────────────────────────────
    const admin = await Admin.findOne({ email: normalizedEmail }).select("+password +currentToken");
    if (admin) {
      const isMatch = await admin.comparePassword(password);
      if (!isMatch) return next(handleErrors(401, "Invalid email or password"));
      if (!admin.isVerified) return next(handleErrors(403, "Please verify your email first"));

      const token = signToken({ id: admin._id, role: admin.role });
      admin.currentToken = token;
      admin.lastLogin = new Date();
      await admin.save({ validateBeforeSave: false });

      return res.status(200).json({
        success: true,
        message: "Login successful",
        token,
        user: {
          _id:        admin._id,
          name:       admin.name,
          email:      admin.email,
          role:       admin.role,
          profile:    admin.profile,
          profile_id: admin.profile_id,
        },
      });
    }

    // ── 2. Check Coach ────────────────────────────────────
    const coach = await Coach.findOne({ email: normalizedEmail }).select("+password +currentToken");
    if (!coach) return next(handleErrors(401, "Invalid email or password"));

    if (!coach.password) {
      return next(handleErrors(400, "Account setup incomplete. Contact your admin."));
    }

    const isMatch = await coach.comparePassword(password);
    if (!isMatch) return next(handleErrors(401, "Invalid email or password"));

    if (coach.status !== "active") {
      return next(handleErrors(403, "Your account is deactivated. Contact admin."));
    }

    // ── Coach first login → send OTP ──────────────────────
    if (!coach.isEmailVerified) {
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      coach.otp = otp;
      coach.otpCreatedAt = new Date();
      await coach.save({ validateBeforeSave: false });
      await sendCoachVerificationOtp(coach.email, coach.name, otp);

      return res.status(200).json({
        success: true,
        requiresEmailVerification: true,
        message: "OTP sent to your email. Please verify to continue.",
        email: coach.email,
      });
    }

    // ── Coach normal login ─────────────────────────────────
    const token = signToken({ id: coach._id, role: "coach" });
    coach.currentToken = token;
    coach.lastLogin = new Date();
    await coach.save({ validateBeforeSave: false });

    return res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      user: {
        _id:        coach._id,
        name:       coach.name,
        email:      coach.email,
        role:       coach.role,
        profile:    coach.profile,
        profile_id: coach.profile_id,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ── POST /auth/verify-coach-email ─────────────────────────
export const verifyCoachEmail = async (req, res, next) => {
  try {
    const { email, otp } = req.body;
    if (!email?.trim() || !otp?.trim()) {
      return next(handleErrors(400, "Email and OTP are required"));
    }

    const coach = await Coach.findOne({ email: email.toLowerCase().trim() }).select("+currentToken");
    if (!coach) return next(handleErrors(404, "Coach not found"));
    if (coach.isEmailVerified) return next(handleErrors(400, "Email already verified"));
    if (!coach.otp || coach.otp !== otp) return next(handleErrors(400, "Invalid OTP"));

    const otpAge = Date.now() - new Date(coach.otpCreatedAt).getTime();
    if (otpAge > 10 * 60 * 1000) {
      return next(handleErrors(400, "OTP expired. Please login again to get a new OTP."));
    }

    const token = signToken({ id: coach._id, role: "coach" });
    coach.isEmailVerified = true;
    coach.otp = null;
    coach.otpCreatedAt = null;
    coach.currentToken = token;
    coach.lastLogin = new Date();
    await coach.save({ validateBeforeSave: false });

    return res.status(200).json({
      success: true,
      message: "Email verified. Login successful!",
      token,
      user: {
        _id:        coach._id,
        name:       coach.name,
        email:      coach.email,
        role:       coach.role,
        profile:    coach.profile,
        profile_id: coach.profile_id,
      },
    });
  } catch (err) {
    next(err);
  }
};