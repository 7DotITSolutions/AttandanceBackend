// =============================================================
// FILE: src/controllers/admin/student.controller.js
// PURPOSE: Admin manages students across all batches.
// CHANGES:
//   - aadharNumber now REQUIRED in createStudent
//   - Duplicate check: same Aadhaar in same batch = blocked
//   - Duplicate check: same Aadhaar in different batch = allowed
//     but response includes existingStudent info so admin knows
//   - Aadhaar format validated: exactly 12 digits
//   - bulkCreateStudents also validates and checks duplicates
// =============================================================

import Student from "../../models/student.model.js";
import Batch from "../../models/batch.model.js";
import handleErrors from "../../middleware/handleErrors.js";
import deleteFromCloudinary from "../../middleware/deleteImage.js";

// ── Aadhaar validation helper ─────────────────────────────
const isValidAadhar = (num) => /^\d{12}$/.test(num?.trim());

// ── POST /admin/student/create ────────────────────────────
export const createStudent = async (req, res, next) => {
  try {
    const {
      name, fatherName, motherName, phone,
      aadharNumber, schoolName, address, DOB,
      batchId, monthlyFee,
    } = req.body;
    const adminId = req.admin._id;

    // ── Required field validation ─────────────────────────
    if (!name?.trim() || !fatherName?.trim() || !phone?.trim() || !batchId) {
      return next(handleErrors(400, "Name, father name, phone and batch are required"));
    }
    if (!aadharNumber?.trim()) {
      return next(handleErrors(400, "Aadhaar number is required"));
    }
    if (!isValidAadhar(aadharNumber)) {
      return next(handleErrors(400, "Aadhaar number must be exactly 12 digits"));
    }

    // ── Batch validation ──────────────────────────────────
    const batch = await Batch.findOne({ _id: batchId, adminId });
    if (!batch) return next(handleErrors(404, "Batch not found"));
    if (batch.status !== "active") {
      return next(handleErrors(400, "Cannot enroll students in an inactive batch"));
    }

    // ── DUPLICATE CHECK 1: Same Aadhaar in SAME batch ─────
    // This is a hard block — same student cannot be in same batch twice
    const sameBatchDup = await Student.findOne({
      aadharNumber: aadharNumber.trim(),
      batchId,
    });
    if (sameBatchDup) {
      return next(
        handleErrors(
          400,
          `Student with Aadhaar ${aadharNumber.trim()} is already enrolled in this batch. ` +
          `Name: ${sameBatchDup.name}`
        )
      );
    }

    // ── DUPLICATE CHECK 2: Same Aadhaar in DIFFERENT batch ─
    // Allowed (student can attend multiple batches) but we warn
    const otherBatchDup = await Student.findOne({
      aadharNumber: aadharNumber.trim(),
      adminId,
      batchId: { $ne: batchId },
    });

    // ── Create student ────────────────────────────────────
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
      coachId: batch.coachId || null,
      adminId,
      monthlyFee:
        monthlyFee !== undefined &&
          monthlyFee !== null &&
          monthlyFee !== "" &&
          !isNaN(monthlyFee)
          ? Number(monthlyFee)
          : batch.fee || 0,
      createdBy: req.admin.name,
    });

    if (req.files?.profile?.[0]) {
      student.profile = req.files.profile[0].path;
      student.profile_id = req.files.profile[0].filename;
    }
    if (req.files?.aadharCardImage?.[0]) {
      student.aadharCardImage = req.files.aadharCardImage[0].path;
      student.aadharCardImage_id = req.files.aadharCardImage[0].filename;
    }

    await student.save();

    // Build response — include info if student is in other batches
    const response = {
      success: true,
      message: "Student enrolled successfully",
      student,
    };

    if (otherBatchDup) {
      response.info = `Note: This student (${otherBatchDup.name}) is also enrolled in batch "${otherBatchDup.batchName}"`;
      response.existingEnrollments = [
        { batchName: otherBatchDup.batchName, batchId: otherBatchDup.batchId },
      ];
    }

    res.status(201).json(response);
  } catch (err) {
    // MongoDB duplicate key fallback
    if (err.code === 11000) {
      const key = Object.keys(err.keyPattern || {})[0];
      if (key === "aadharNumber") {
        return next(handleErrors(400, "This Aadhaar number is already enrolled in this batch"));
      }
      return next(handleErrors(400, "Duplicate entry detected"));
    }
    next(err);
  }
};

// ── GET /admin/student ────────────────────────────────────
export const getStudents = async (req, res, next) => {
  try {
    const adminId = req.admin._id;
    const { batchId, status, search } = req.query;

    const filter = { adminId };
    if (batchId) filter.batchId = batchId;
    if (status) filter.status = status;
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { fatherName: { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } },
        { aadharNumber: { $regex: search, $options: "i" } },
      ];
    }

    const students = await Student.find(filter)
      .select("name fatherName phone aadharNumber batchName status monthlyFee advanceBalance enrollDate profile")
      .sort({ createdAt: -1 });

    res.status(200).json({ success: true, students, total: students.length });
  } catch (err) {
    next(err);
  }
};

// ── GET /admin/student/:id ────────────────────────────────
export const getStudentById = async (req, res, next) => {
  try {
    const student = await Student.findOne({
      _id: req.params.id,
      adminId: req.admin._id,
    })
      .populate("batchId", "batchName timing weekDays fee startTime endTime")
      .populate("coachId", "name email phone");

    if (!student) return next(handleErrors(404, "Student not found"));

    // Also find all other batches this student is enrolled in
    const otherEnrollments = await Student.find({
      aadharNumber: student.aadharNumber,
      adminId: student.adminId,
      _id: { $ne: student._id },
    }).select("batchName batchId status");

    res.status(200).json({
      success: true,
      student,
      otherEnrollments,
    });
  } catch (err) {
    next(err);
  }
};

// ── GET /admin/student/by-aadhar/:aadharNumber ────────────
// Fetch all enrollments of a student across batches by Aadhaar
export const getStudentByAadhar = async (req, res, next) => {
  try {
    const { aadharNumber } = req.params;
    const adminId = req.admin._id;

    if (!isValidAadhar(aadharNumber)) {
      return next(handleErrors(400, "Invalid Aadhaar number"));
    }

    const enrollments = await Student.find({
      aadharNumber: aadharNumber.trim(),
      adminId,
    }).populate("batchId", "batchName timing status");

    if (!enrollments.length) {
      return next(handleErrors(404, "No student found with this Aadhaar number"));
    }

    res.status(200).json({
      success: true,
      aadharNumber,
      studentName: enrollments[0].name,
      fatherName: enrollments[0].fatherName,
      enrollments,
      totalBatches: enrollments.length,
    });
  } catch (err) {
    next(err);
  }
};

// ── PUT /admin/student/:id ────────────────────────────────
export const updateStudent = async (req, res, next) => {
  try {
    const {
      name, fatherName, motherName, phone,
      aadharNumber, schoolName, address,
      DOB, status, monthlyFee,
    } = req.body;

    const student = await Student.findOne({
      _id: req.params.id,
      adminId: req.admin._id,
    });
    if (!student) return next(handleErrors(404, "Student not found"));

    // Aadhaar change — validate and check for conflicts
    if (aadharNumber?.trim() && aadharNumber.trim() !== student.aadharNumber) {
      if (!isValidAadhar(aadharNumber)) {
        return next(handleErrors(400, "Aadhaar number must be exactly 12 digits"));
      }
      // Check new Aadhaar isn't already in this batch under a different record
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
    if (req.files?.aadharCardImage?.[0]) {
      if (student.aadharCardImage_id) await deleteFromCloudinary(student.aadharCardImage_id);
      student.aadharCardImage = req.files.aadharCardImage[0].path;
      student.aadharCardImage_id = req.files.aadharCardImage[0].filename;
    }

    await student.save();
    res.status(200).json({ success: true, message: "Student updated", student });
  } catch (err) {
    if (err.code === 11000) {
      return next(handleErrors(400, "Aadhaar number conflict — already enrolled in this batch"));
    }
    next(err);
  }
};

// ── DELETE /admin/student/:id ─────────────────────────────
export const deleteStudent = async (req, res, next) => {
  try {
    const student = await Student.findOne({
      _id: req.params.id,
      adminId: req.admin._id,
    });
    if (!student) return next(handleErrors(404, "Student not found"));

    if (student.profile_id) await deleteFromCloudinary(student.profile_id);
    if (student.aadharCardImage_id) await deleteFromCloudinary(student.aadharCardImage_id);

    await Student.findByIdAndDelete(student._id);
    res.status(200).json({ success: true, message: "Student deleted" });
  } catch (err) {
    next(err);
  }
};

// ── POST /admin/student/bulk ──────────────────────────────
export const bulkCreateStudents = async (req, res, next) => {
  try {
    const { batchId, students } = req.body;
    const adminId = req.admin._id;

    if (!batchId || !students?.length) {
      return next(handleErrors(400, "Batch ID and students array are required"));
    }

    const batch = await Batch.findOne({ _id: batchId, adminId });
    if (!batch) return next(handleErrors(404, "Batch not found"));

    let created = 0;
    let skipped = 0;
    const skippedReasons = [];

    for (const s of students) {
      try {
        const aadhar = s.aadharNumber?.toString().trim();
        const phone = s.phone?.toString().trim();

        if (!aadhar) {
          skipped++;
          skippedReasons.push(`${s.name || "Unknown"} — missing Aadhaar number`);
          continue;
        }
        if (!isValidAadhar(aadhar)) {
          skipped++;
          skippedReasons.push(`${s.name || "Unknown"} — Aadhaar must be 12 digits (got: ${aadhar})`);
          continue;
        }
        if (!phone) {
          skipped++;
          skippedReasons.push(`${s.name || "Unknown"} — missing phone number`);
          continue;
        }

        // Skip if same Aadhaar already in this batch
        const exists = await Student.findOne({ aadharNumber: aadhar, batchId });
        if (exists) {
          skipped++;
          skippedReasons.push(
            `${s.name || "Unknown"} (${aadhar}) — already enrolled in this batch`
          );
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
          coachId: batch.coachId || null,
          adminId,
          monthlyFee:
            s.monthlyFee !== undefined &&
              s.monthlyFee !== null &&
              s.monthlyFee !== "" &&
              !isNaN(s.monthlyFee)
              ? Number(s.monthlyFee)
              : batch.fee || 0,
          createdBy: req.admin.name,
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