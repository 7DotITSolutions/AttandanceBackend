// =============================================================
// FILE: src/models/student.model.js
// PURPOSE: Student schema with embedded fee and attendance.
//          monthlyFee at top level (overridable per student).
//          Pre-save auto-computes fee status. Safe virtuals.
// =============================================================

import mongoose from "mongoose";

// ── Fee sub-document ──────────────────────────────────────
const feeSchema = new mongoose.Schema(
  {
    month: {
      type:     String,
      required: [true, "Month is required"],
      trim:     true,
    },
    monthlyFee: {
      type:    Number,
      default: 0,
    },
    paidAmount: {
      type:    Number,
      default: 0,
    },
    status: {
      type:    String,
      enum:    ["paid", "partial", "pending"],
      default: "pending",
    },
    paymentDate: {
      type:    Date,
      default: null,
    },
    paymentMethod: {
      type:    String,
      enum:    ["cash", "upi", "bank", "other"],
      default: "cash",
    },
    receiptNo: {
      type:    String,
      trim:    true,
      default: "",
    },
    collectedBy: {
      type:    mongoose.Schema.Types.ObjectId,
      default: null,
    },
    collectedByModel: {
      type:    String,
      enum:    ["Admin", "Coach", null],
      default: null,
    },
    remarks: {
      type:    String,
      trim:    true,
      default: "",
    },
  },
  { _id: true }
);

// ── Attendance sub-document ───────────────────────────────
const attendanceSchema = new mongoose.Schema(
  {
    date: {
      type:     Date,
      required: true,
    },
    status: {
      type:     String,
      enum:     ["present", "absent", "leave"],
      required: true,
    },
    remark: {
      type:    String,
      trim:    true,
      default: "",
    },
    markedBy: {
      type:    mongoose.Schema.Types.ObjectId,
      default: null,
    },
    markedByModel: {
      type:    String,
      enum:    ["Admin", "Coach", null],
      default: null,
    },
  },
  { _id: true }
);

// ── Student schema ────────────────────────────────────────
const studentSchema = new mongoose.Schema(
  {
    name: {
      type:     String,
      required: [true, "Student name is required"],
      trim:     true,
    },
    fatherName: {
      type:     String,
      required: [true, "Father name is required"],
      trim:     true,
    },
    motherName: {
      type:    String,
      trim:    true,
      default: "",
    },
    phone: {
      type:     String,
      required: [true, "Phone number is required"],
      trim:     true,
    },
    aadharNumber: {
      type:    String,
      trim:    true,
      default: "",
    },
    schoolName: {
      type:    String,
      trim:    true,
      default: "",
    },
    address: {
      type:    String,
      trim:    true,
      default: "",
    },
    DOB: {
      type:    String,
      default: "",
    },
    enrollDate: {
      type:    Date,
      default: Date.now,
    },
    monthlyFee: {
      type:    Number,
      default: 0,
    },
    advanceBalance: {
      type:    Number,
      default: 0,
    },
    status: {
      type:    String,
      enum:    ["active", "inactive", "left"],
      default: "active",
    },
    profile: {
      type:    String,
      default: "",
    },
    profile_id: {
      type:    String,
      default: "",
    },
    aadharCardImage: {
      type:    String,
      default: "",
    },
    aadharCardImage_id: {
      type:    String,
      default: "",
    },
    adminId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "Admin",
      required: true,
    },
    batchId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "Batch",
      required: true,
    },
    batchName: {
      type:     String,
      required: true,
      trim:     true,
    },
    coachId: {
      type:    mongoose.Schema.Types.ObjectId,
      ref:     "Coach",
      default: null,
    },
    createdBy: {
      type:    String,
      default: "",
    },
    lastFeeReminderSentAt: {
      type:    Date,
      default: null,
    },
    fee: {
      type: [feeSchema],
      default: [],
    },
    attendance: {
      type: [attendanceSchema],
      default: [],
    },
  },
  {
    timestamps: true,
    toJSON:   { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ── Indexes ───────────────────────────────────────────────
studentSchema.index({ adminId: 1, batchId: 1 });
studentSchema.index({ adminId: 1, status:  1 });
studentSchema.index({ batchId: 1, status:  1 });
studentSchema.index({ coachId: 1 });

// ── Virtuals ──────────────────────────────────────────────
studentSchema.virtual("totalFeePaid").get(function () {
  const arr = this.fee || [];
  return arr.reduce((sum, f) => sum + (f.paidAmount || 0), 0);
});

studentSchema.virtual("outstandingBalance").get(function () {
  const arr = this.fee || [];
  return arr.reduce((sum, f) => {
    const due = (f.monthlyFee || 0) - (f.paidAmount || 0);
    return sum + (due > 0 ? due : 0);
  }, 0);
});

studentSchema.virtual("attendanceStats").get(function () {
  const arr = this.attendance || [];
  const total = arr.length;
  if (!total) return { total: 0, present: 0, absent: 0, leave: 0, percentage: 0 };
  const present = arr.filter((a) => a.status === "present").length;
  const absent  = arr.filter((a) => a.status === "absent").length;
  const leave   = arr.filter((a) => a.status === "leave").length;
  return {
    total, present, absent, leave,
    percentage: Math.round((present / total) * 100),
  };
});

// ── Pre-save: auto-compute fee status ────────────────────
studentSchema.pre("save", function () {
  (this.fee || []).forEach((f) => {
    if (!f.paidAmount || f.paidAmount <= 0) {
      f.status = "pending";
    } else if ((f.paidAmount || 0) >= (f.monthlyFee || 0)) {
      f.status = "paid";
    } else {
      f.status = "partial";
    }
  });
});

const Student = mongoose.model("Student", studentSchema);
export default Student;