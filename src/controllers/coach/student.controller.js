// =============================================================
// FILE: src/controllers/coach/student.controller.js
// PURPOSE: Coach manages students in their assigned batches.
//          aadharNumber now required. Same duplicate logic as
//          admin controller — same Aadhaar in same batch blocked,
//          same Aadhaar in different batch allowed.
// =============================================================

import Student from "../../models/student.model.js";
import Batch from "../../models/batch.model.js";
import handleErrors from "../../middleware/handleErrors.js";
import deleteFromCloudinary from "../../middleware/deleteImage.js";

// ── Aadhaar validation helper ─────────────────────────────
const isValidAadhar = (num) => /^\d{12}$/.test(num?.trim());

// ── Verify batch belongs to coach ────────────────────────
const verifyCoachBatch = (batchId, coachId, adminId) =>
  Batch.findOne({ _id: batchId, coachId, adminId });

// ── GET /coach/batch/:batchId/students ────────────────────
export const coachGetBatchStudents = async (req, res, next) => {
  try {
    const { batchId } = req.params;
    const coachId = req.coach._id;
    const adminId = req.coach.adminId;

    const batch = await verifyCoachBatch(batchId, coachId, adminId);
    if (!batch) return next(handleErrors(403, "You are not assigned to this batch"));

    const { search } = req.query;
    const filter = { batchId, coachId, status: "active" };

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { fatherName: { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } },
        { aadharNumber: { $regex: search, $options: "i" } },
      ];
    }

    const students = await Student.find(filter)
      .select("name fatherName phone aadharNumber monthlyFee advanceBalance status enrollDate profile batchName DOB schoolName address")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      batch: {
        _id: batch._id,
        batchName: batch.batchName,
        timing: batch.timing,
        startTime: batch.startTime,
        endTime: batch.endTime,
        weekDays: batch.weekDays,
        fee: batch.fee,
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
    const coachId = req.coach._id;

    const student = await Student.findOne({ _id: studentId, coachId })
      .populate("batchId", "batchName timing startTime endTime weekDays fee")
      .populate("coachId", "name email phone");

    if (!student) return next(handleErrors(404, "Student not found or not in your batch"));

    res.status(200).json({ success: true, student });
  } catch (err) {
    next(err);
  }
};

// ── POST /coach/batch/:batchId/students ───────────────────
export const coachCreateStudent = async (req, res, next) => {
  try {
    const { batchId } = req.params;
    const coachId = req.coach._id;
    const adminId = req.coach.adminId;

    const {
      name, fatherName, motherName, phone,
      aadharNumber, schoolName, address, DOB, monthlyFee,
    } = req.body;

    // ── Required validation ───────────────────────────────
    if (!name?.trim() || !fatherName?.trim() || !phone?.trim()) {
      return next(handleErrors(400, "Name, father name and phone are required"));
    }
    if (!aadharNumber?.trim()) {
      return next(handleErrors(400, "Aadhaar number is required"));
    }
    if (!isValidAadhar(aadharNumber)) {
      return next(handleErrors(400, "Aadhaar number must be exactly 12 digits"));
    }

    // ── Verify batch belongs to this coach ────────────────
    const batch = await verifyCoachBatch(batchId, coachId, adminId);
    if (!batch) return next(handleErrors(403, "You are not assigned to this batch"));
    if (batch.status !== "active") {
      return next(handleErrors(400, "Cannot enroll students in an inactive batch"));
    }

    // ── Same Aadhaar in same batch = blocked ──────────────
    const sameBatchDup = await Student.findOne({
      aadharNumber: aadharNumber.trim(),
      batchId,
    });
    if (sameBatchDup) {
      return next(
        handleErrors(
          400,
          `Student with Aadhaar ${aadharNumber.trim()} already enrolled in this batch. ` +
          `Name: ${sameBatchDup.name}`
        )
      );
    }

    // ── Same Aadhaar in another batch = allowed, just note ─
    const otherBatchDup = await Student.findOne({
      aadharNumber: aadharNumber.trim(),
      adminId,
      batchId: { $ne: batchId },
    });

    const student = new Student({
      name: name.trim(),
      fatherName: fatherName.trim(),
      motherName: motherName?.trim() || "",
      phone: phone.trim(),
      aadharNumber: aadharNumber.trim(),
      schoolName: schoolName?.trim() || "",
      address: address?.trim() || "",
      DOB: DOB || "",
      batchId: batch._id,
      batchName: batch.batchName,
      coachId,
      adminId,
      monthlyFee:
        monthlyFee !== undefined &&
          monthlyFee !== null &&
          monthlyFee !== "" &&
          !isNaN(monthlyFee)
          ? Number(monthlyFee)
          : batch.fee || 0,
      createdBy: req.coach.name,
    });

    if (req.files?.profile?.[0]) {
      student.profile = req.files.profile[0].path;
      student.profile_id = req.files.profile[0].filename;
    }

    await student.save();

    const response = {
      success: true,
      message: "Student enrolled successfully",
      student,
    };
    if (otherBatchDup) {
      response.info = `Note: This student is also in batch "${otherBatchDup.batchName}"`;
    }

    res.status(201).json(response);
  } catch (err) {
    if (err.code === 11000) {
      return next(handleErrors(400, "This Aadhaar is already enrolled in this batch"));
    }
    next(err);
  }
};

// ── PUT /coach/student/:studentId ─────────────────────────
export const coachUpdateStudent = async (req, res, next) => {
  try {
    const { studentId } = req.params;
    const coachId = req.coach._id;

    const student = await Student.findOne({ _id: studentId, coachId });
    if (!student) return next(handleErrors(404, "Student not found or not in your batch"));

    const {
      name, fatherName, motherName, phone,
      aadharNumber, schoolName, address, DOB, status, monthlyFee,
    } = req.body;

    // Aadhaar update — validate and check conflict
    if (aadharNumber?.trim() && aadharNumber.trim() !== student.aadharNumber) {
      if (!isValidAadhar(aadharNumber)) {
        return next(handleErrors(400, "Aadhaar number must be exactly 12 digits"));
      }
      const conflict = await Student.findOne({
        aadharNumber: aadharNumber.trim(),
        batchId: student.batchId,
        _id: { $ne: student._id },
      });
      if (conflict) {
        return next(
          handleErrors(400, `Aadhaar ${aadharNumber.trim()} already enrolled in this batch (${conflict.name})`)
        );
      }
      student.aadharNumber = aadharNumber.trim();
    }

    if (name?.trim()) student.name = name.trim();
    if (fatherName?.trim()) student.fatherName = fatherName.trim();
    if (motherName !== undefined) student.motherName = motherName?.trim() || "";
    if (phone?.trim()) student.phone = phone.trim();
    if (schoolName !== undefined) student.schoolName = schoolName?.trim() || "";
    if (address !== undefined) student.address = address?.trim() || "";
    if (DOB !== undefined) student.DOB = DOB || "";
    if (status) student.status = status;
    if (
      monthlyFee !== undefined &&
      monthlyFee !== null &&
      monthlyFee !== "" &&
      !isNaN(monthlyFee)
    ) {
      student.monthlyFee = Number(monthlyFee);
    }

    if (req.files?.profile?.[0]) {
      if (student.profile_id) await deleteFromCloudinary(student.profile_id);
      student.profile = req.files.profile[0].path;
      student.profile_id = req.files.profile[0].filename;
    }

    await student.save();
    res.status(200).json({ success: true, message: "Student updated", student });
  } catch (err) {
    if (err.code === 11000) {
      return next(handleErrors(400, "Aadhaar conflict — already enrolled in this batch"));
    }
    next(err);
  }
};

// ── DELETE /coach/student/:studentId ─────────────────────
export const coachDeleteStudent = async (req, res, next) => {
  try {
    const { studentId } = req.params;
    const coachId = req.coach._id;

    const student = await Student.findOne({ _id: studentId, coachId });
    if (!student) return next(handleErrors(404, "Student not found or not in your batch"));

    if (student.profile_id) await deleteFromCloudinary(student.profile_id);
    await Student.findByIdAndDelete(student._id);

    res.status(200).json({ success: true, message: "Student deleted" });
  } catch (err) {
    next(err);
  }
};

// ── POST /coach/batch/:batchId/students/bulk ──────────────
export const coachBulkCreateStudents = async (req, res, next) => {
  try {
    const { batchId } = req.params;
    const { students } = req.body;
    const coachId = req.coach._id;
    const adminId = req.coach.adminId;

    if (!students?.length) {
      return next(handleErrors(400, "Students array is required"));
    }

    const batch = await verifyCoachBatch(batchId, coachId, adminId);
    if (!batch) return next(handleErrors(403, "You are not assigned to this batch"));

    let created = 0;
    let skipped = 0;
    const skippedReasons = [];

    for (const s of students) {
      try {
        const aadhar = s.aadharNumber?.toString().trim();
        const phone = s.phone?.toString().trim();

        if (!aadhar) {
          skipped++;
          skippedReasons.push(`${s.name || "Unknown"} — missing Aadhaar`);
          continue;
        }
        if (!isValidAadhar(aadhar)) {
          skipped++;
          skippedReasons.push(`${s.name || "Unknown"} — Aadhaar must be 12 digits`);
          continue;
        }
        if (!phone) {
          skipped++;
          skippedReasons.push(`${s.name || "Unknown"} — missing phone`);
          continue;
        }

        const exists = await Student.findOne({ aadharNumber: aadhar, batchId });
        if (exists) {
          skipped++;
          skippedReasons.push(`${s.name || "Unknown"} (${aadhar}) — already in this batch`);
          continue;
        }

        await Student.create({
          name: s.name?.trim() || "Unknown",
          fatherName: s.fatherName?.trim() || "Unknown",
          motherName: s.motherName?.trim() || "",
          phone,
          aadharNumber: aadhar,
          schoolName: s.schoolName?.trim() || "",
          address: s.address?.trim() || "",
          DOB: s.DOB || "",
          batchId: batch._id,
          batchName: batch.batchName,
          coachId,
          adminId,
          monthlyFee:
            s.monthlyFee !== undefined &&
              s.monthlyFee !== null &&
              s.monthlyFee !== "" &&
              !isNaN(s.monthlyFee)
              ? Number(s.monthlyFee)
              : batch.fee || 0,
          createdBy: req.coach.name,
        });
        created++;
      } catch (rowErr) {
        skipped++;
        skippedReasons.push(`${s.name || "Unknown"} — ${rowErr.message}`);
      }
    }

    res.status(201).json({
      success: true,
      message: `${created} enrolled. ${skipped} skipped.`,
      created,
      skipped,
      skippedReasons,
    });
  } catch (err) {
    next(err);
  }
};