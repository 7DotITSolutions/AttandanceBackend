// =============================================================
// FILE: src/models/coach.model.js
// PURPOSE: Coach schema. Created by admin. Logs in with email
//          + password. isEmailVerified flips true after first
//          login OTP. After that logs in directly forever.
// FIX: pre("save") hook uses try/catch. Password hashed only
//      when modified and when password field exists.
// =============================================================

import mongoose from "mongoose";
import bcrypt   from "bcryptjs";

const coachSchema = new mongoose.Schema(
  {
    name: {
      type:     String,
      required: [true, "Name is required"],
      trim:     true,
    },
    email: {
      type:      String,
      required:  [true, "Email is required"],
      lowercase: true,
      trim:      true,
    },
    phone: {
      type:     String,
      required: [true, "Phone is required"],
      trim:     true,
    },
    password: {
      type:   String,
      select: false,
    },
    isEmailVerified: {
      type:    Boolean,
      default: false,
    },
    role: {
      type:    String,
      default: "coach",
    },
    status: {
      type:    String,
      enum:    ["active", "inactive", "suspended"],
      default: "active",
    },
    assignedBatches: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref:  "Batch",
      },
    ],
    adminId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "Admin",
      required: true,
    },
    otp: {
      type:    String,
      default: null,
    },
    otpCreatedAt: {
      type:    Date,
      default: null,
    },
    profile: {
      type:    String,
      default: null,
    },
    profile_id: {
      type:    String,
      default: null,
    },
    currentToken: {
      type:    String,
      default: null,
    },
    lastLogin: {
      type:    Date,
      default: null,
    },
  },
  { timestamps: true }
);

// ── Hash password before saving ───────────────────────────
coachSchema.pre("save", async function () {
  if (!this.password || !this.isModified("password")) return;

  this.password = await bcrypt.hash(this.password, 12);
});

// ── Compare password ──────────────────────────────────────
coachSchema.methods.comparePassword = async function (enteredPassword) {
  return bcrypt.compare(enteredPassword, this.password);
};

const Coach = mongoose.model("Coach", coachSchema);
export default Coach;