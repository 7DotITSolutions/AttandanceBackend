// =============================================================
// FILE: src/models/batch.model.js
// PURPOSE: Batch schema. startTime + endTime stored as strings
//          like "9:00 AM". Pre-save keeps legacy timing field
//          in sync as "9:00 AM - 10:30 AM".
// FIX: pre("save") hook uses try/catch pattern consistently.
// =============================================================

import mongoose from "mongoose";

const batchSchema = new mongoose.Schema(
  {
    batchName: {
      type:     String,
      required: [true, "Batch name is required"],
      trim:     true,
    },
    startTime: {
      type:    String,
      trim:    true,
      default: "",
    },
    endTime: {
      type:    String,
      trim:    true,
      default: "",
    },
    // Legacy display field — kept in sync by pre-save hook
    timing: {
      type:    String,
      trim:    true,
      default: "Not Assigned",
    },
    fee: {
      type:    Number,
      min:     0,
      default: 0,
    },
    weekDays: [
      {
        type: String,
        enum: [
          "monday", "tuesday", "wednesday",
          "thursday", "friday", "saturday", "sunday",
        ],
      },
    ],
    adminId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "Admin",
      required: true,
    },
    coachId: {
      type:    mongoose.Schema.Types.ObjectId,
      ref:     "Coach",
      default: null,
    },
    coachName: {
      type:    String,
      trim:    true,
      default: "",
    },
    status: {
      type:    String,
      enum:    ["active", "inactive", "archived"],
      default: "active",
    },
    createdBy: {
      type:    String,
      trim:    true,
      default: "",
    },
  },
  {
    timestamps: true,
    toJSON:   { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ── Virtual: formatted timing display ─────────────────────
batchSchema.virtual("timingDisplay").get(function () {
  if (this.startTime && this.endTime) {
    return `${this.startTime} - ${this.endTime}`;
  }
  return "Not Assigned";
});

// ── Pre-save: sync legacy timing field ────────────────────
batchSchema.pre("save", function () {
  if (this.startTime && this.endTime) {
    this.timing = `${this.startTime} - ${this.endTime}`;
  }
});

// ── Indexes ───────────────────────────────────────────────
batchSchema.index({ adminId: 1, status: 1 });
batchSchema.index({ coachId: 1 });

const Batch = mongoose.model("Batch", batchSchema);
export default Batch;