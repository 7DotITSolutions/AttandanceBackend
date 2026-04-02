// =============================================================
// FILE: src/models/coach.model.js
// PURPOSE: Mongoose schema for a Coach created by an Admin.
//          Coach logs in with email + password (set by admin).
//          isEmailVerified flips to true after first-login OTP.
//          After that, coach logs in directly with email+password.
//          coachUsername kept (sparse) for backward compatibility.
// =============================================================

import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const coachSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      lowercase: true,
      trim: true,
    },
    phone: {
      type: String,
      required: [true, "Phone is required"],
      trim: true,
    },

    // ── Password-based auth (new flow) ────────────────────
    password: {
      type: String,
      select: false,
    },
    // Flips true after coach verifies email on first login
    isEmailVerified: {
      type: Boolean,
      default: false,
    },

    role: {
      type: String,
      default: "coach",
    },

    status: {
      type: String,
      enum: ["active", "inactive", "suspended"],
      default: "active",
    },

    // Batches assigned to this coach
    assignedBatches: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Batch",
      },
    ],

    // Which admin created this coach
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
    },

    // OTP for first-login email verification
    otp: {
      type: String,
      default: null,
    },
    otpCreatedAt: {
      type: Date,
      default: null,
    },

    // Profile image
    profile: {
      type: String,
      default: null,
    },
    profile_id: {
      type: String,
      default: null,
    },

    // Active JWT (single-session enforcement)
    currentToken: {
      type: String,
      default: null,
    },

    lastLogin: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

// ── Hash password before saving ───────────────────────────
coachSchema.pre("save", async function (next) {
  if (!this.isModified("password") || !this.password) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// ── Compare password ──────────────────────────────────────
coachSchema.methods.comparePassword = async function (entered) {
  return bcrypt.compare(entered, this.password);
};

export default mongoose.model("Coach", coachSchema);