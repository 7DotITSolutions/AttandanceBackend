// =============================================================
// FILE: src/models/admin.model.js
// PURPOSE: Mongoose schema for the Owner/Admin of an institution.
//          Supports role "admin" (owner only) and "admin+coach"
//          (owner who also coaches batches personally).
//          Handles password hashing and comparison.
// =============================================================

import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const adminSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      select: false, // never returned in queries by default
    },

    // "admin"       → owner only
    // "admin+coach" → owner who also coaches
    role: {
      type: String,
      enum: ["admin", "admin+coach"],
      default: "admin",
    },

    // Email verification (used during registration)
    isVerified: {
      type: Boolean,
      default: false,
    },
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
      default: "",
    },
    profile_id: {
      type: String,
      default: "",
    },

    // Active JWT token (for single-session enforcement)
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
// adminSchema.pre("save", async function (next) {
//   if (!this.isModified("password")) return next();
//   this.password = await bcrypt.hash(this.password, 12);
//   next();
// });
adminSchema.pre("save", async function () {
  if (!this.isModified("password")) return;

  this.password = await bcrypt.hash(this.password, 12);
});
// ── Compare entered password with stored hash ─────────────
adminSchema.methods.comparePassword = async function (entered) {
  return bcrypt.compare(entered, this.password);
};

export default mongoose.model("Admin", adminSchema);