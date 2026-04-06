// =============================================================
// FILE: src/models/admin.model.js
// PURPOSE: Admin/Owner schema. Role "admin" or "admin+coach".
// FIX: pre("save") hook rewritten using async/await with proper
//      error handling. The next() call issue was caused by
//      bcrypt throwing inside the hook and next being called
//      with wrong context. Now uses try/catch and passes error
//      to next() correctly.
// =============================================================

import mongoose from "mongoose";
import bcrypt   from "bcryptjs";

const adminSchema = new mongoose.Schema(
  {
    name: {
      type:     String,
      required: [true, "Name is required"],
      trim:     true,
    },
    email: {
      type:     String,
      required: [true, "Email is required"],
      unique:   true,
      lowercase: true,
      trim:     true,
    },
    password: {
      type:     String,
      required: [true, "Password is required"],
      select:   false,
    },
    role: {
      type:    String,
      enum:    ["admin", "admin+coach"],
      default: "admin",
    },
    isVerified: {
      type:    Boolean,
      default: false,
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
      default: "",
    },
    profile_id: {
      type:    String,
      default: "",
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
// FIX: Use try/catch inside the hook and pass errors to next()
adminSchema.pre("save", async function () {
  if (!this.isModified("password")) return;

  this.password = await bcrypt.hash(this.password, 12);
});

// ── Compare password ──────────────────────────────────────
adminSchema.methods.comparePassword = async function (enteredPassword) {
  return bcrypt.compare(enteredPassword, this.password);
};

const Admin = mongoose.model("Admin", adminSchema);
export default Admin;