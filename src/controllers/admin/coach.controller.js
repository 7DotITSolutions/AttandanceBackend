// =============================================================
// FILE: src/controllers/admin/coach.controller.js
// PURPOSE: Admin manages coaches. Create sends credentials
//          to coach email. List shows all coaches with batch
//          count. Status toggle deactivates and unassigns.
//          Delete removes coach and cleans up batch refs.
// =============================================================

import Coach from "../../models/coach.model.js";
import Batch from "../../models/batch.model.js";
import Student from "../../models/student.model.js";
import handleErrors from "../../middleware/handleErrors.js";
import deleteFromCloudinary from "../../middleware/deleteImage.js";
import { sendCoachCredentials } from "../../utils/sendEmail.js";

// ── POST /admin/coach/create ──────────────────────────────
export const createCoach = async (req, res, next) => {
  try {
    const { name, email, phone, password } = req.body;
    const adminId = req.admin._id;

    if (!name?.trim() || !email?.trim() || !phone?.trim() || !password?.trim()) {
      return next(handleErrors(400, "Name, email, phone and password are required"));
    }
    if (password.length < 8) {
      return next(handleErrors(400, "Password must be at least 8 characters"));
    }

    const existing = await Coach.findOne({
      email: email.toLowerCase().trim(),
      adminId,
    });
    if (existing) return next(handleErrors(400, "A coach with this email already exists"));

    const coach = new Coach({
      name:     name.trim(),
      email:    email.toLowerCase().trim(),
      phone:    phone.trim(),
      password,
      adminId,
      isEmailVerified: false,
      status: "active",
    });
    await coach.save();

    // Email credentials to coach
    await sendCoachCredentials(coach.email, coach.name, password);

    res.status(201).json({
      success: true,
      message: "Coach created. Login credentials sent to their email.",
      coach: {
        _id:    coach._id,
        name:   coach.name,
        email:  coach.email,
        phone:  coach.phone,
        status: coach.status,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ── GET /admin/coach ──────────────────────────────────────
export const getCoaches = async (req, res, next) => {
  try {
    const coaches = await Coach.find({ adminId: req.admin._id })
      .populate("assignedBatches", "batchName timing status")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      coaches: coaches.map((c) => ({
        _id:            c._id,
        name:           c.name,
        email:          c.email,
        phone:          c.phone,
        status:         c.status,
        profile:        c.profile,
        isEmailVerified: c.isEmailVerified,
        assignedBatches: c.assignedBatches,
        batchCount:     c.assignedBatches.length,
        createdAt:      c.createdAt,
      })),
      total: coaches.length,
    });
  } catch (err) {
    next(err);
  }
};

// ── GET /admin/coach/:id ──────────────────────────────────
export const getCoachById = async (req, res, next) => {
  try {
    const coach = await Coach.findOne({
      _id: req.params.id,
      adminId: req.admin._id,
    }).populate("assignedBatches", "batchName timing fee status weekDays");

    if (!coach) return next(handleErrors(404, "Coach not found"));

    res.status(200).json({ success: true, coach });
  } catch (err) {
    next(err);
  }
};

// ── PUT /admin/coach/:id/status ───────────────────────────
export const updateCoachStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!["active", "inactive", "suspended"].includes(status)) {
      return next(handleErrors(400, "Invalid status"));
    }

    const coach = await Coach.findOne({
      _id: req.params.id,
      adminId: req.admin._id,
    });
    if (!coach) return next(handleErrors(404, "Coach not found"));

    // If deactivating, unassign all batches
    if (status !== "active") {
      await Batch.updateMany(
        { coachId: coach._id },
        { coachId: null, coachName: "" }
      );
      await Student.updateMany({ coachId: coach._id }, { coachId: null });
      coach.assignedBatches = [];
    }

    coach.status = status;
    await coach.save({ validateBeforeSave: false });

    res.status(200).json({ success: true, message: `Coach ${status}`, coach });
  } catch (err) {
    next(err);
  }
};

// ── DELETE /admin/coach/:id ───────────────────────────────
export const deleteCoach = async (req, res, next) => {
  try {
    const coach = await Coach.findOne({
      _id: req.params.id,
      adminId: req.admin._id,
    });
    if (!coach) return next(handleErrors(404, "Coach not found"));

    // Clean up batches and students
    await Batch.updateMany(
      { coachId: coach._id },
      { coachId: null, coachName: "" }
    );
    await Student.updateMany({ coachId: coach._id }, { coachId: null });

    if (coach.profile_id) await deleteFromCloudinary(coach.profile_id);

    await Coach.findByIdAndDelete(coach._id);
    res.status(200).json({ success: true, message: "Coach deleted" });
  } catch (err) {
    next(err);
  }
};