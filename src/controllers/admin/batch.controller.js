// =============================================================
// FILE: src/controllers/admin/batch.controller.js
// PURPOSE: Full CRUD for Batches.
// FIXES:
//   1. updateBatch() now handles coachId — saves it on Batch,
//      updates Coach.assignedBatches, syncs Student.coachId
//   2. createBatch() also syncs Coach.assignedBatches on create
//   3. assignCoach() kept as standalone endpoint for direct use
//   4. deleteBatch() cleans up Coach.assignedBatches properly
// =============================================================

import Batch   from "../../models/batch.model.js";
import Coach   from "../../models/coach.model.js";
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
    if (exists) {
      return next(handleErrors(400, "A batch with this name already exists"));
    }

    // Validate coach if provided
    let coachName = "";
    if (coachId) {
      const coach = await Coach.findOne({ _id: coachId, adminId, status: "active" });
      if (!coach) return next(handleErrors(404, "Coach not found or inactive"));
      coachName = coach.name;
    }

    const batch = new Batch({
      batchName:  batchName.trim(),
      startTime:  startTime?.trim() || "",
      endTime:    endTime?.trim()   || "",
      fee:        Number(fee)       || 0,
      weekDays:   weekDays          || [],
      coachId:    coachId           || null,
      coachName,
      adminId,
      createdBy:  req.admin.name,
    });

    await batch.save();

    // Add batch to coach's assignedBatches
    if (coachId) {
      await Coach.findByIdAndUpdate(coachId, {
        $addToSet: { assignedBatches: batch._id },
      });
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

    // Attach active student count to each batch
    const batchesWithCount = await Promise.all(
      batches.map(async (batch) => {
        const studentCount = await Student.countDocuments({
          batchId: batch._id,
          status:  "active",
        });
        return { ...batch.toObject(), studentCount };
      })
    );

    res.status(200).json({
      success: true,
      batches: batchesWithCount,
      total:   batchesWithCount.length,
    });
  } catch (err) {
    next(err);
  }
};

// ── GET /admin/batch/:id ──────────────────────────────────
export const getBatchById = async (req, res, next) => {
  try {
    const batch = await Batch.findOne({
      _id:     req.params.id,
      adminId: req.admin._id,
    }).populate("coachId", "name email phone");

    if (!batch) return next(handleErrors(404, "Batch not found"));

    const students = await Student.find({
      batchId: batch._id,
      status:  "active",
    }).select("name fatherName phone monthlyFee advanceBalance status enrollDate");

    res.status(200).json({
      success:      true,
      batch,
      students,
      studentCount: students.length,
    });
  } catch (err) {
    next(err);
  }
};

// ── PUT /admin/batch/:id ──────────────────────────────────
// FIX: Now handles coachId changes — updates Coach.assignedBatches
//      and syncs Student.coachId for all students in this batch
export const updateBatch = async (req, res, next) => {
  try {
    const { batchName, startTime, endTime, fee, weekDays, status, coachId } = req.body;
    const adminId = req.admin._id;

    const batch = await Batch.findOne({ _id: req.params.id, adminId });
    if (!batch) return next(handleErrors(404, "Batch not found"));

    // ── Basic field updates ───────────────────────────────
    if (batchName?.trim()) batch.batchName = batchName.trim();
    if (startTime !== undefined) batch.startTime = startTime?.trim() || "";
    if (endTime   !== undefined) batch.endTime   = endTime?.trim()   || "";
    if (fee       !== undefined) batch.fee       = Number(fee)       || 0;
    if (weekDays  !== undefined) batch.weekDays  = weekDays;
    if (status)                  batch.status    = status;

    // ── Coach assignment handling ─────────────────────────
    // coachId comes as string from form, normalize to null if empty
    const newCoachId = coachId && coachId !== "" ? coachId : null;
    const oldCoachId = batch.coachId ? batch.coachId.toString() : null;
    const coachChanged = newCoachId !== oldCoachId;

    if (coachChanged) {
      // Step 1: Remove batch from OLD coach's assignedBatches
      if (oldCoachId) {
        await Coach.findByIdAndUpdate(oldCoachId, {
          $pull: { assignedBatches: batch._id },
        });
      }

      if (newCoachId) {
        // Step 2: Validate new coach belongs to this admin
        const newCoach = await Coach.findOne({
          _id:    newCoachId,
          adminId,
          status: "active",
        });
        if (!newCoach) {
          return next(handleErrors(404, "Coach not found or inactive"));
        }

        // Step 3: Add batch to new coach's assignedBatches
        await Coach.findByIdAndUpdate(newCoachId, {
          $addToSet: { assignedBatches: batch._id },
        });

        // Step 4: Update batch fields
        batch.coachId   = newCoach._id;
        batch.coachName = newCoach.name;
      } else {
        // Unassigning coach
        batch.coachId   = null;
        batch.coachName = "";
      }

      // Step 5: Sync coachId on ALL students in this batch
      await Student.updateMany(
        { batchId: batch._id },
        { coachId: newCoachId || null }
      );
    }

    await batch.save();

    // Return populated batch
    const updatedBatch = await Batch.findById(batch._id)
      .populate("coachId", "name email phone");

    res.status(200).json({
      success: true,
      message: "Batch updated successfully",
      batch:   updatedBatch,
    });
  } catch (err) {
    next(err);
  }
};

// ── POST /admin/batch/:id/assign-coach ───────────────────
// Standalone endpoint for assigning/unassigning coach
export const assignCoach = async (req, res, next) => {
  try {
    const { coachId } = req.body;
    const adminId     = req.admin._id;

    const batch = await Batch.findOne({ _id: req.params.id, adminId });
    if (!batch) return next(handleErrors(404, "Batch not found"));

    const oldCoachId = batch.coachId ? batch.coachId.toString() : null;

    // Remove batch from old coach
    if (oldCoachId) {
      await Coach.findByIdAndUpdate(oldCoachId, {
        $pull: { assignedBatches: batch._id },
      });
    }

    if (!coachId || coachId === "") {
      // Unassign
      batch.coachId   = null;
      batch.coachName = "";
      await batch.save();
      await Student.updateMany({ batchId: batch._id }, { coachId: null });

      return res.status(200).json({
        success: true,
        message: "Coach unassigned from batch",
        batch,
      });
    }

    // Assign new coach
    const coach = await Coach.findOne({ _id: coachId, adminId, status: "active" });
    if (!coach) return next(handleErrors(404, "Coach not found or inactive"));

    await Coach.findByIdAndUpdate(coachId, {
      $addToSet: { assignedBatches: batch._id },
    });

    batch.coachId   = coach._id;
    batch.coachName = coach.name;
    await batch.save();

    // Sync students
    await Student.updateMany({ batchId: batch._id }, { coachId: coach._id });

    const updatedBatch = await Batch.findById(batch._id)
      .populate("coachId", "name email phone");

    res.status(200).json({
      success: true,
      message: "Coach assigned successfully",
      batch:   updatedBatch,
    });
  } catch (err) {
    next(err);
  }
};

// ── DELETE /admin/batch/:id ───────────────────────────────
export const deleteBatch = async (req, res, next) => {
  try {
    const batch = await Batch.findOne({
      _id:     req.params.id,
      adminId: req.admin._id,
    });
    if (!batch) return next(handleErrors(404, "Batch not found"));

    const studentCount = await Student.countDocuments({ batchId: batch._id });
    if (studentCount > 0) {
      return next(
        handleErrors(
          400,
          `Cannot delete batch with ${studentCount} students. Archive it or move students first.`
        )
      );
    }

    // Remove batch from coach's assignedBatches
    if (batch.coachId) {
      await Coach.findByIdAndUpdate(batch.coachId, {
        $pull: { assignedBatches: batch._id },
      });
    }

    await Batch.findByIdAndDelete(batch._id);

    res.status(200).json({
      success: true,
      message: "Batch deleted successfully",
    });
  } catch (err) {
    next(err);
  }
};