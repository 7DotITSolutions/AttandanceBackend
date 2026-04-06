// =============================================================
// FILE: src/controllers/coach/student.controller.js
// PURPOSE: Coach can view students in their assigned batches.
//          All queries are scoped by coachId so a coach can
//          NEVER access another coach's students even if they
//          guess the batchId or studentId.
// =============================================================

// =============================================================
// FILE: src/controllers/coach/student.controller.js
// PURPOSE: Coach manages students in their assigned batches.
//          Coach can: view, add, edit, delete students AND
//          bulk import from Excel (parsed on frontend, array
//          sent to /coach/batch/:batchId/students/bulk).
//          All operations scoped to coachId — coach cannot
//          touch students outside their assigned batches.
// =============================================================

import Student from "../../models/student.model.js";
import Batch   from "../../models/batch.model.js";
import handleErrors from "../../middleware/handleErrors.js";
import deleteFromCloudinary from "../../middleware/deleteImage.js";

// ── Helper: verify batch belongs to this coach ────────────
const verifyCoachBatch = async (batchId, coachId, adminId) => {
  return Batch.findOne({ _id: batchId, coachId, adminId });
};

// ── GET /coach/batch/:batchId/students ────────────────────
export const coachGetBatchStudents = async (req, res, next) => {
  try {
    const { batchId } = req.params;
    const coachId     = req.coach._id;
    const adminId     = req.coach.adminId;

    const batch = await verifyCoachBatch(batchId, coachId, adminId);
    if (!batch) {
      return next(handleErrors(403, "You are not assigned to this batch"));
    }

    const { search } = req.query;
    const filter = { batchId, coachId, status: "active" };

    if (search) {
      filter.$or = [
        { name:       { $regex: search, $options: "i" } },
        { fatherName: { $regex: search, $options: "i" } },
        { phone:      { $regex: search, $options: "i" } },
      ];
    }

    const students = await Student.find(filter)
      .select(
        "name fatherName phone monthlyFee advanceBalance " +
        "status enrollDate profile batchName DOB schoolName address"
      )
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      batch: {
        _id:       batch._id,
        batchName: batch.batchName,
        timing:    batch.timing,
        startTime: batch.startTime,
        endTime:   batch.endTime,
        weekDays:  batch.weekDays,
        fee:       batch.fee,
      },
      students,
      total: students.length,
    });
  } catch (err) {
    next(err);
  }
};

// ── GET /coach/student/:studentId ─────────────────────────
export const coachGetStudentById = async (req, res, next) => {
  try {
    const { studentId } = req.params;
    const coachId       = req.coach._id;

    const student = await Student.findOne({ _id: studentId, coachId })
      .populate("batchId", "batchName timing startTime endTime weekDays fee")
      .populate("coachId", "name email phone");

    if (!student) {
      return next(handleErrors(404, "Student not found or not in your batch"));
    }

    res.status(200).json({ success: true, student });
  } catch (err) {
    next(err);
  }
};

// ── POST /coach/batch/:batchId/students ───────────────────
export const coachCreateStudent = async (req, res, next) => {
  try {
    const { batchId } = req.params;
    const coachId     = req.coach._id;
    const adminId     = req.coach.adminId;

    const {
      name, fatherName, motherName, phone,
      schoolName, address, DOB, monthlyFee,
    } = req.body;

    if (!name?.trim() || !fatherName?.trim() || !phone?.trim()) {
      return next(handleErrors(400, "Name, father name and phone are required"));
    }

    // Verify batch belongs to this coach
    const batch = await verifyCoachBatch(batchId, coachId, adminId);
    if (!batch) {
      return next(handleErrors(403, "You are not assigned to this batch"));
    }
    if (batch.status !== "active") {
      return next(handleErrors(400, "Cannot enroll students in an inactive batch"));
    }

    // Duplicate check: same phone in same batch
    const phoneDup = await Student.findOne({ phone: phone.trim(), batchId });
    if (phoneDup) {
      return next(
        handleErrors(
          400,
          `Phone ${phone.trim()} already enrolled in this batch (${phoneDup.name})`
        )
      );
    }

    const student = new Student({
      name:       name.trim(),
      fatherName: fatherName.trim(),
      motherName: motherName?.trim() || "",
      phone:      phone.trim(),
      schoolName: schoolName?.trim() || "",
      address:    address?.trim()    || "",
      DOB:        DOB                || "",
      batchId:    batch._id,
      batchName:  batch.batchName,
      coachId,
      adminId,
      monthlyFee: monthlyFee !== undefined ? Number(monthlyFee) : batch.fee || 0,
      createdBy:  req.coach.name,
    });

    // Handle uploaded images
    if (req.files?.profile?.[0]) {
      student.profile    = req.files.profile[0].path;
      student.profile_id = req.files.profile[0].filename;
    }

    await student.save();

    res.status(201).json({
      success: true,
      message: "Student enrolled successfully",
      student,
    });
  } catch (err) {
    next(err);
  }
};

// ── PUT /coach/student/:studentId ─────────────────────────
export const coachUpdateStudent = async (req, res, next) => {
  try {
    const { studentId } = req.params;
    const coachId       = req.coach._id;

    const student = await Student.findOne({ _id: studentId, coachId });
    if (!student) {
      return next(handleErrors(404, "Student not found or not in your batch"));
    }

    const {
      name, fatherName, motherName, phone,
      schoolName, address, DOB, status, monthlyFee,
    } = req.body;

    // Duplicate phone check if phone is changing
    if (phone?.trim() && phone.trim() !== student.phone) {
      const phoneDup = await Student.findOne({
        phone:   phone.trim(),
        batchId: student.batchId,
        _id:     { $ne: student._id },
      });
      if (phoneDup) {
        return next(
          handleErrors(400, `Phone ${phone.trim()} already used by ${phoneDup.name} in this batch`)
        );
      }
    }

    if (name?.trim())             student.name       = name.trim();
    if (fatherName?.trim())       student.fatherName = fatherName.trim();
    if (motherName !== undefined) student.motherName = motherName?.trim() || "";
    if (phone?.trim())            student.phone      = phone.trim();
    if (schoolName !== undefined) student.schoolName = schoolName?.trim() || "";
    if (address    !== undefined) student.address    = address?.trim()    || "";
    if (DOB        !== undefined) student.DOB        = DOB || "";
    if (status)                   student.status     = status;
    if (monthlyFee !== undefined) student.monthlyFee = Number(monthlyFee);

    if (req.files?.profile?.[0]) {
      if (student.profile_id) await deleteFromCloudinary(student.profile_id);
      student.profile    = req.files.profile[0].path;
      student.profile_id = req.files.profile[0].filename;
    }

    await student.save();

    res.status(200).json({
      success: true,
      message: "Student updated",
      student,
    });
  } catch (err) {
    next(err);
  }
};

// ── DELETE /coach/student/:studentId ─────────────────────
export const coachDeleteStudent = async (req, res, next) => {
  try {
    const { studentId } = req.params;
    const coachId       = req.coach._id;

    const student = await Student.findOne({ _id: studentId, coachId });
    if (!student) {
      return next(handleErrors(404, "Student not found or not in your batch"));
    }

    if (student.profile_id) await deleteFromCloudinary(student.profile_id);

    await Student.findByIdAndDelete(student._id);

    res.status(200).json({ success: true, message: "Student deleted" });
  } catch (err) {
    next(err);
  }
};

// ── POST /coach/batch/:batchId/students/bulk ──────────────
// Frontend parses Excel with xlsx library and sends array here
export const coachBulkCreateStudents = async (req, res, next) => {
  try {
    const { batchId }  = req.params;
    const { students } = req.body;
    const coachId      = req.coach._id;
    const adminId      = req.coach.adminId;

    if (!students?.length) {
      return next(handleErrors(400, "Students array is required"));
    }

    const batch = await verifyCoachBatch(batchId, coachId, adminId);
    if (!batch) {
      return next(handleErrors(403, "You are not assigned to this batch"));
    }

    let created = 0;
    let skipped = 0;
    const skippedReasons = [];

    for (const s of students) {
      try {
        const phone = s.phone?.toString().trim();
        if (!phone) {
          skipped++;
          skippedReasons.push(`${s.name || "Unknown"} — missing phone`);
          continue;
        }

        // Skip if already enrolled in this batch
        const exists = await Student.findOne({ phone, batchId });
        if (exists) {
          skipped++;
          skippedReasons.push(
            `${s.name || "Unknown"} — phone ${phone} already enrolled`
          );
          continue;
        }

        await Student.create({
          name:       s.name?.trim()       || "Unknown",
          fatherName: s.fatherName?.trim() || "Unknown",
          motherName: s.motherName?.trim() || "",
          phone,
          schoolName: s.schoolName?.trim() || "",
          address:    s.address?.trim()    || "",
          DOB:        s.DOB                || "",
          batchId:    batch._id,
          batchName:  batch.batchName,
          coachId,
          adminId,
          monthlyFee: s.monthlyFee || batch.fee || 0,
          createdBy:  req.coach.name,
        });
        created++;
      } catch (rowErr) {
        skipped++;
        skippedReasons.push(`${s.name || "Unknown"} — ${rowErr.message}`);
      }
    }

    res.status(201).json({
      success: true,
      message: `${created} students enrolled. ${skipped} skipped.`,
      created,
      skipped,
      skippedReasons,
    });
  } catch (err) {
    next(err);
  }
};