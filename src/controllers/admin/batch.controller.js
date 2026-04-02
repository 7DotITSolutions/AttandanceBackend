// =============================================================
// FILE: src/controllers/admin/batch.controller.js
// PURPOSE: Full CRUD for Batches. Admin can create, list,
//          update, archive and delete batches. Includes coach
//          assignment and student count per batch.
//          startTime + endTime stored as "9:00 AM" strings.
// =============================================================

import Batch from "../../models/batch.model.js";
import Coach from "../../models/coach.model.js";
import Student from "../../models/student.model.js";
import handleErrors from "../../middleware/handleErrors.js";

// ── POST /admin/batch/create ──────────────────────────────
export const createBatch = async (req, res, next) => {
  try {
    const { batchName, startTime, endTime, fee, weekDays, coachId } = req.body;
    const adminId = req.admin._id;

    if (!batchName?.trim()) {
      return next(handleErrors(400, "Batch name is required"));
    }

    // Check duplicate name for this admin
    const exists = await Batch.findOne({
      batchName: { $regex: new RegExp(`^${batchName.trim()}$`, "i") },
      adminId,
    });
    if (exists) return next(handleErrors(400, "A batch with this name already exists"));

    // Validate coach if provided
    if (coachId) {
      const coach = await Coach.findOne({ _id: coachId, adminId, status: "active" });
      if (!coach) return next(handleErrors(404, "Coach not found or inactive"));
    }

    const batch = new Batch({
      batchName: batchName.trim(),
      startTime: startTime?.trim() || "",
      endTime:   endTime?.trim()   || "",
      fee:       fee || 0,
      weekDays:  weekDays || [],
      coachId:   coachId || null,
      adminId,
      createdBy: req.admin.name,
    });

    await batch.save();

    // If coach assigned, add batch to coach's assignedBatches
    if (coachId) {
      await Coach.findByIdAndUpdate(coachId, {
        $addToSet: { assignedBatches: batch._id },
      });
      batch.coachName = (await Coach.findById(coachId))?.name || "";
      await batch.save({ validateBeforeSave: false });
    }

    res.status(201).json({
      success: true,
      message: "Batch created successfully",
      batch,
    });
  } catch (err) {
    next(err);
  }
};

// ── GET /admin/batch ──────────────────────────────────────
export const getBatches = async (req, res, next) => {
  try {
    const adminId = req.admin._id;
    const { status } = req.query;

    const filter = { adminId };
    if (status) filter.status = status;

    const batches = await Batch.find(filter)
      .populate("coachId", "name email phone")
      .sort({ createdAt: -1 });

    // Attach student count to each batch
    const batchesWithCount = await Promise.all(
      batches.map(async (batch) => {
        const studentCount = await Student.countDocuments({
          batchId: batch._id,
          status: "active",
        });
        return { ...batch.toObject(), studentCount };
      })
    );

    res.status(200).json({
      success: true,
      batches: batchesWithCount,
      total: batchesWithCount.length,
    });
  } catch (err) {
    next(err);
  }
};

// ── GET /admin/batch/:id ──────────────────────────────────
export const getBatchById = async (req, res, next) => {
  try {
    const batch = await Batch.findOne({
      _id: req.params.id,
      adminId: req.admin._id,
    }).populate("coachId", "name email phone");

    if (!batch) return next(handleErrors(404, "Batch not found"));

    const students = await Student.find({
      batchId: batch._id,
      status: "active",
    }).select("name phone monthlyFee advanceBalance attendanceStats");

    res.status(200).json({
      success: true,
      batch,
      students,
      studentCount: students.length,
    });
  } catch (err) {
    next(err);
  }
};

// ── PUT /admin/batch/:id ──────────────────────────────────
export const updateBatch = async (req, res, next) => {
  try {
    const { batchName, startTime, endTime, fee, weekDays, status } = req.body;
    const batch = await Batch.findOne({
      _id: req.params.id,
      adminId: req.admin._id,
    });
    if (!batch) return next(handleErrors(404, "Batch not found"));

    if (batchName?.trim()) batch.batchName = batchName.trim();
    if (startTime !== undefined) batch.startTime = startTime.trim();
    if (endTime   !== undefined) batch.endTime   = endTime.trim();
    if (fee       !== undefined) batch.fee       = fee;
    if (weekDays  !== undefined) batch.weekDays  = weekDays;
    if (status)                  batch.status    = status;

    await batch.save();
    res.status(200).json({ success: true, message: "Batch updated", batch });
  } catch (err) {
    next(err);
  }
};

// ── POST /admin/batch/:id/assign-coach ───────────────────
export const assignCoach = async (req, res, next) => {
  try {
    const { coachId } = req.body;
    const adminId = req.admin._id;

    const batch = await Batch.findOne({ _id: req.params.id, adminId });
    if (!batch) return next(handleErrors(404, "Batch not found"));

    // Remove batch from previous coach
    if (batch.coachId) {
      await Coach.findByIdAndUpdate(batch.coachId, {
        $pull: { assignedBatches: batch._id },
      });
    }

    if (!coachId) {
      // Unassign coach
      batch.coachId   = null;
      batch.coachName = "";
      await batch.save();
      await Student.updateMany({ batchId: batch._id }, { coachId: null });
      return res.status(200).json({ success: true, message: "Coach unassigned", batch });
    }

    const coach = await Coach.findOne({ _id: coachId, adminId, status: "active" });
    if (!coach) return next(handleErrors(404, "Coach not found or inactive"));

    batch.coachId   = coach._id;
    batch.coachName = coach.name;
    await batch.save();

    await Coach.findByIdAndUpdate(coachId, {
      $addToSet: { assignedBatches: batch._id },
    });

    // Update coachId on all students in this batch
    await Student.updateMany({ batchId: batch._id }, { coachId: coach._id });

    res.status(200).json({ success: true, message: "Coach assigned", batch });
  } catch (err) {
    next(err);
  }
};

// ── DELETE /admin/batch/:id ───────────────────────────────
export const deleteBatch = async (req, res, next) => {
  try {
    const batch = await Batch.findOne({
      _id: req.params.id,
      adminId: req.admin._id,
    });
    if (!batch) return next(handleErrors(404, "Batch not found"));

    const studentCount = await Student.countDocuments({ batchId: batch._id });
    if (studentCount > 0) {
      return next(handleErrors(400, `Cannot delete batch with ${studentCount} students. Archive it instead.`));
    }

    // Remove from coach's assigned batches
    if (batch.coachId) {
      await Coach.findByIdAndUpdate(batch.coachId, {
        $pull: { assignedBatches: batch._id },
      });
    }

    await Batch.findByIdAndDelete(batch._id);
    res.status(200).json({ success: true, message: "Batch deleted" });
  } catch (err) {
    next(err);
  }
};