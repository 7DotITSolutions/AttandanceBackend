// =============================================================
// FILE: src/controllers/auth/unified.auth.controller.js
// PURPOSE: Single POST /auth/login for all users (admin/coach).
//          Checks Admin first, then Coach by email.
//          Returns both role-specific key AND generic "user"
//          key so frontend AuthContext works reliably.
//          POST /auth/verify-coach-email for first-login OTP.
// =============================================================

import Admin from "../../models/admin.model.js";
import Coach from "../../models/coach.model.js";
import jwt   from "jsonwebtoken";
import handleErrors from "../../middleware/handleErrors.js";
import { sendCoachVerificationOtp } from "../../utils/sendEmail.js";

// ── Sign JWT ──────────────────────────────────────────────
const signToken = (payload) =>
  jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });

// ── Sanitize — never send password/token to client ────────
const sanitize = (doc) => ({
  _id:        doc._id,
  name:       doc.name,
  email:      doc.email,
  role:       doc.role,
  profile:    doc.profile    || null,
  profile_id: doc.profile_id || null,
});

// ── POST /auth/login ──────────────────────────────────────
export const unifiedLogin = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email?.trim() || !password?.trim()) {
      return next(handleErrors(400, "Email and password are required"));
    }

    const normalizedEmail = email.toLowerCase().trim();

    // ── Step 1: Check Admin collection ───────────────────
    const admin = await Admin.findOne({ email: normalizedEmail })
      .select("+password +currentToken");

    if (admin) {
      // Admin found — verify password
      const isMatch = await admin.comparePassword(password);
      if (!isMatch) {
        return next(handleErrors(401, "Invalid email or password"));
      }

      if (!admin.isVerified) {
        return next(
          handleErrors(403, "Email not verified. Check your inbox for OTP.")
        );
      }

      // Generate token and save
      const token = signToken({ id: admin._id, role: admin.role });
      admin.currentToken = token;
      admin.lastLogin    = new Date();
      await admin.save({ validateBeforeSave: false });

      const userData = sanitize(admin);

      return res.status(200).json({
        success: true,
        message: "Login successful",
        token,
        user:  userData,  // generic — AuthContext always reads this
        admin: userData,  // role-specific — for backward compat
      });
    }

    // ── Step 2: Check Coach collection ───────────────────
    const coach = await Coach.findOne({ email: normalizedEmail })
      .select("+password +currentToken");

    if (!coach) {
      // Neither admin nor coach found
      return next(handleErrors(401, "Invalid email or password"));
    }

    // Coach must have password set (new flow)
    if (!coach.password) {
      return next(
        handleErrors(
          400,
          "Account setup incomplete. Contact your admin to reset credentials."
        )
      );
    }

    // Verify password
    const isMatch = await coach.comparePassword(password);
    if (!isMatch) {
      return next(handleErrors(401, "Invalid email or password"));
    }

    // Check coach is active
    if (coach.status !== "active") {
      return next(
        handleErrors(403, "Your account is deactivated. Contact your admin.")
      );
    }

    // ── Coach first login: send OTP ───────────────────────
    if (!coach.isEmailVerified) {
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      coach.otp          = otp;
      coach.otpCreatedAt = new Date();
      await coach.save({ validateBeforeSave: false });

      // Send OTP email
      await sendCoachVerificationOtp(coach.email, coach.name, otp);

      return res.status(200).json({
        success:                   true,
        requiresEmailVerification: true,
        message: "OTP sent to your email. Please verify to continue.",
        email:   coach.email, // frontend stores this as coachPendingEmail
      });
    }

    // ── Coach normal login ────────────────────────────────
    const token = signToken({ id: coach._id, role: "coach" });
    coach.currentToken = token;
    coach.lastLogin    = new Date();
    await coach.save({ validateBeforeSave: false });

    const userData = sanitize(coach);

    return res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      user:  userData,  // generic
      coach: userData,  // role-specific
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

    const coach = await Coach.findOne({
      email: email.toLowerCase().trim(),
    }).select("+currentToken");

    if (!coach) {
      return next(handleErrors(404, "Coach not found"));
    }

    if (coach.isEmailVerified) {
      return next(handleErrors(400, "Email is already verified. Please login normally."));
    }

    if (!coach.otp || coach.otp !== otp) {
      return next(handleErrors(400, "Invalid OTP. Please check your email."));
    }

    // Check OTP expiry (10 minutes)
    const otpAge = Date.now() - new Date(coach.otpCreatedAt).getTime();
    if (otpAge > 10 * 60 * 1000) {
      return next(
        handleErrors(400, "OTP has expired. Please login again to receive a new OTP.")
      );
    }

    // Mark verified and issue token
    const token = signToken({ id: coach._id, role: "coach" });
    coach.isEmailVerified = true;
    coach.otp             = null;
    coach.otpCreatedAt    = null;
    coach.currentToken    = token;
    coach.lastLogin       = new Date();
    await coach.save({ validateBeforeSave: false });

    const userData = sanitize(coach);

    return res.status(200).json({
      success: true,
      message: "Email verified successfully. Welcome!",
      token,
      user:  userData,
      coach: userData,
    });

  } catch (err) {
    next(err);
  }
};