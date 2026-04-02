// =============================================================
// FILE: src/models/student.model.js
// PURPOSE: Mongoose schema for a Student enrolled in a Batch.
//          Contains embedded fee records (one per month) and
//          embedded attendance records (one per day).
//          monthlyFee lives at top level — defaults from batch
//          fee but can be overridden per student (discounts etc).
//          Pre-save hook auto-computes fee status so you never
//          set it manually.
//          Three virtuals: totalFeePaid, outstandingBalance,
//          attendanceStats.
// =============================================================

import mongoose from "mongoose";

// ── Fee sub-document (one entry per month) ────────────────
const feeSchema = new mongoose.Schema(
  {
    // Format: "January 2025"
    month: {
      type: String,
      required: [true, "Month is required"],
      trim: true,
    },
    // What the student owes this month
    monthlyFee: {
      type: Number,
      default: 0,
    },
    // What has actually been collected so far
    paidAmount: {
      type: Number,
      default: 0,
    },
    // Auto-computed by pre-save hook:
    // pending  → paidAmount === 0
    // partial  → 0 < paidAmount < monthlyFee
    // paid     → paidAmount >= monthlyFee
    status: {
      type: String,
      enum: ["paid", "partial", "pending"],
      default: "pending",
    },
    paymentDate: {
      type: Date,
      default: null,
    },
    paymentMethod: {
      type: String,
      enum: ["cash", "upi", "bank", "other"],
      default: "cash",
    },
    // Auto-generated: "RCP-202501-0042"
    receiptNo: {
      type: String,
      trim: true,
      default: "",
    },
    // Who collected (Admin._id or Coach._id)
    collectedBy: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    collectedByModel: {
      type: String,
      enum: ["Admin", "Coach", null],
      default: null,
    },
    remarks: {
      type: String,
      trim: true,
      default: "",
    },
  },
  { _id: true }
);

// ── Attendance sub-document (one entry per day) ───────────
const attendanceSchema = new mongoose.Schema(
  {
    date: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      enum: ["present", "absent", "leave"],
      required: true,
    },
    remark: {
      type: String,
      trim: true,
      default: "",
    },
    // Who marked this (Admin._id or Coach._id)
    markedBy: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    markedByModel: {
      type: String,
      enum: ["Admin", "Coach", null],
      default: null,
    },
  },
  { _id: true }
);

// ── Student schema ────────────────────────────────────────
const studentSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Student name is required"],
      trim: true,
    },
    fatherName: {
      type: String,
      required: [true, "Father name is required"],
      trim: true,
    },
    motherName: {
      type: String,
      trim: true,
      default: "",
    },
    phone: {
      type: String,
      required: [true, "Phone number is required"],
      trim: true,
    },
    aadharNumber: {
      type: String,
      trim: true,
      default: "",
    },
    schoolName: {
      type: String,
      trim: true,
      default: "",
    },
    address: {
      type: String,
      trim: true,
      default: "",
    },
    DOB: {
      type: String,
      default: "",
    },

    // Date student joined this batch
    enrollDate: {
      type: Date,
      default: Date.now,
    },

    // ── Monthly fee (top-level, per student) ─────────────
    // Defaults to batch.fee at enrollment
    // Override here for discounts / special cases
    monthlyFee: {
      type: Number,
      default: 0,
    },

    // Excess payment accumulates here
    // Auto-deducted during next fee generation
    advanceBalance: {
      type: Number,
      default: 0,
    },

    status: {
      type: String,
      enum: ["active", "inactive", "left"],
      default: "active",
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

    // Aadhaar card image
    aadharCardImage: {
      type: String,
      default: "",
    },
    aadharCardImage_id: {
      type: String,
      default: "",
    },

    // ── Relations ─────────────────────────────────────────
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
    },
    batchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Batch",
      required: true,
    },
    batchName: {
      type: String,
      required: true,
      trim: true,
    },
    coachId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Coach",
      default: null,
    },

    createdBy: {
      type: String,
      default: "",
    },

    lastFeeReminderSentAt: {
      type: Date,
      default: null,
    },

    // ── Embedded records ──────────────────────────────────
    fee: [feeSchema],
    attendance: [attendanceSchema],
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ── Indexes for common queries ────────────────────────────
studentSchema.index({ adminId: 1, batchId: 1 });
studentSchema.index({ adminId: 1, status: 1 });
studentSchema.index({ batchId: 1, status: 1 });
studentSchema.index({ coachId: 1 });

// ── Virtual: total amount paid across all months ──────────
studentSchema.virtual("totalFeePaid").get(function () {
  return this.fee.reduce((sum, f) => sum + (f.paidAmount || 0), 0);
});

// ── Virtual: total outstanding (unpaid portion) ───────────
studentSchema.virtual("outstandingBalance").get(function () {
  return this.fee.reduce((sum, f) => {
    const due = (f.monthlyFee || 0) - (f.paidAmount || 0);
    return sum + (due > 0 ? due : 0);
  }, 0);
});

// ── Virtual: attendance summary ───────────────────────────
studentSchema.virtual("attendanceStats").get(function () {
  const total   = this.attendance.length;
  if (total === 0) return { total: 0, present: 0, absent: 0, leave: 0, percentage: 0 };
  const present = this.attendance.filter((a) => a.status === "present").length;
  const absent  = this.attendance.filter((a) => a.status === "absent").length;
  const leave   = this.attendance.filter((a) => a.status === "leave").length;
  return {
    total,
    present,
    absent,
    leave,
    percentage: Math.round((present / total) * 100),
  };
});

// ── Pre-save: auto-compute fee status ────────────────────
studentSchema.pre("save", function (next) {
  this.fee.forEach((f) => {
    if (!f.paidAmount || f.paidAmount <= 0) {
      f.status = "pending";
    } else if (f.paidAmount >= f.monthlyFee) {
      f.status = "paid";
    } else {
      f.status = "partial";
    }
  });
  next();
});

export default mongoose.model("Student", studentSchema);