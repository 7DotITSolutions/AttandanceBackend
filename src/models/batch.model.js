// =============================================================
// FILE: src/models/batch.model.js
// PURPOSE: Mongoose schema for a Batch (class/group) created
//          by an Admin. Stores startTime and endTime as free
//          strings like "9:00 AM" and "10:30 AM". A pre-save
//          hook keeps the legacy `timing` field in sync as
//          "9:00 AM – 10:30 AM" so no existing query breaks.
//          weekDays stores which days the batch runs.
// =============================================================

import mongoose from "mongoose";

const batchSchema = new mongoose.Schema(
  {
    batchName: {
      type: String,
      required: [true, "Batch name is required"],
      trim: true,
    },

    // ── Timing stored as human-readable strings ───────────
    // Admin types hour + selects minute + AM/PM
    // Stored as: "9:00 AM", "10:30 PM" etc.
    startTime: {
      type: String,
      trim: true,
      default: "",
    },
    endTime: {
      type: String,
      trim: true,
      default: "",
    },
    // Legacy display field — kept in sync by pre-save hook
    // Format: "9:00 AM – 10:30 AM"
    timing: {
      type: String,
      trim: true,
      default: "Not Assigned",
    },

    // Default monthly fee for students in this batch
    // Can be overridden per student
    fee: {
      type: Number,
      min: 0,
      default: 0,
    },

    // Days this batch runs
    weekDays: [
      {
        type: String,
        enum: [
          "monday","tuesday","wednesday",
          "thursday","friday","saturday","sunday",
        ],
      },
    ],

    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
    },

    coachId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Coach",
      default: null,
    },
    coachName: {
      type: String,
      trim: true,
      default: "",
    },

    status: {
      type: String,
      enum: ["active", "inactive", "archived"],
      default: "active",
    },

    createdBy: {
      type: String,
      trim: true,
      default: "",
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ── Virtual: formatted timing display ─────────────────────
batchSchema.virtual("timingDisplay").get(function () {
  if (this.startTime && this.endTime) {
    return `${this.startTime} – ${this.endTime}`;
  }
  return "Not Assigned";
});

// ── Pre-save: keep legacy timing field in sync ────────────
batchSchema.pre("save", function (next) {
  if (this.startTime && this.endTime) {
    this.timing = `${this.startTime} – ${this.endTime}`;
  }
  next();
});

// ── Indexes ───────────────────────────────────────────────
batchSchema.index({ adminId: 1, status: 1 });
batchSchema.index({ coachId: 1 });

export default mongoose.model("Batch", batchSchema);