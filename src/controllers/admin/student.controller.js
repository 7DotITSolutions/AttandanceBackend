// =============================================================
// FILE: src/controllers/admin/student.controller.js
// PURPOSE: Admin manages students across all batches.
//          Enroll sets monthlyFee from batch.fee by default
//          but allows per-student override. Supports profile
//          and Aadhaar image uploads. Search and filter by
//          batch, status, name. Bulk Excel upload supported.
// =============================================================

import Student from "../../models/student.model.js";
import Batch from "../../models/batch.model.js";
import handleErrors from "../../middleware/handleErrors.js";
import deleteFromCloudinary from "../../middleware/deleteImage.js";

// ── POST /admin/student/create ────────────────────────────
export const createStudent = async (req, res, next) => {
  try {
    const {
      name, fatherName, motherName, phone,
      aadharNumber, schoolName, address, DOB,
      batchId, monthlyFee,
    } = req.body;
    const adminId = req.admin._id;

    if (!name?.trim() || !fatherName?.trim() || !phone?.trim() || !batchId) {
      return next(handleErrors(400, "Name, father name, phone and batch are required"));
    }

    const batch = await Batch.findOne({ _id: batchId, adminId });
    if (!batch) return next(handleErrors(404, "Batch not found"));
    if (batch.status !== "active") {
      return next(handleErrors(400, "Cannot enroll in an inactive batch"));
    }

    const student = new Student({
      name:        name.trim(),
      fatherName:  fatherName.trim(),
      motherName:  motherName?.trim() || "",
      phone:       phone.trim(),
      aadharNumber: aadharNumber?.trim() || "",
      schoolName:  schoolName?.trim() || "",
      address:     address?.trim() || "",
      DOB:         DOB || "",
      batchId:     batch._id,
      batchName:   batch.batchName,
      coachId:     batch.coachId || null,
      adminId,
      monthlyFee:  monthlyFee || batch.fee || 0,
      createdBy:   req.admin.name,
    });

    // Handle uploaded images
    if (req.files?.profile?.[0]) {
      student.profile    = req.files.profile[0].path;
      student.profile_id = req.files.profile[0].filename;
    }
    if (req.files?.aadharCardImage?.[0]) {
      student.aadharCardImage    = req.files.aadharCardImage[0].path;
      student.aadharCardImage_id = req.files.aadharCardImage[0].filename;
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

// ── GET /admin/student ────────────────────────────────────
export const getStudents = async (req, res, next) => {
  try {
    const adminId = req.admin._id;
    const { batchId, status, search } = req.query;

    const filter = { adminId };
    if (batchId) filter.batchId = batchId;
    if (status)  filter.status  = status;
    if (search) {
      filter.$or = [
        { name:        { $regex: search, $options: "i" } },
        { fatherName:  { $regex: search, $options: "i" } },
        { phone:       { $regex: search, $options: "i" } },
      ];
    }

    const students = await Student.find(filter)
      .select("name fatherName phone batchName status monthlyFee advanceBalance enrollDate profile")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      students,
      total: students.length,
    });
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
    }).populate("batchId", "batchName timing weekDays fee")
      .populate("coachId", "name email phone");

    if (!student) return next(handleErrors(404, "Student not found"));

    res.status(200).json({ success: true, student });
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

    if (name?.trim())        student.name        = name.trim();
    if (fatherName?.trim())  student.fatherName  = fatherName.trim();
    if (motherName !== undefined) student.motherName = motherName?.trim() || "";
    if (phone?.trim())       student.phone       = phone.trim();
    if (aadharNumber !== undefined) student.aadharNumber = aadharNumber?.trim() || "";
    if (schoolName !== undefined)   student.schoolName   = schoolName?.trim() || "";
    if (address !== undefined)      student.address      = address?.trim() || "";
    if (DOB !== undefined)          student.DOB          = DOB || "";
    if (status)                     student.status       = status;
    if (monthlyFee !== undefined)   student.monthlyFee   = monthlyFee;

    // Handle image updates
    if (req.files?.profile?.[0]) {
      if (student.profile_id) await deleteFromCloudinary(student.profile_id);
      student.profile    = req.files.profile[0].path;
      student.profile_id = req.files.profile[0].filename;
    }
    if (req.files?.aadharCardImage?.[0]) {
      if (student.aadharCardImage_id) await deleteFromCloudinary(student.aadharCardImage_id);
      student.aadharCardImage    = req.files.aadharCardImage[0].path;
      student.aadharCardImage_id = req.files.aadharCardImage[0].filename;
    }

    await student.save();
    res.status(200).json({ success: true, message: "Student updated", student });
  } catch (err) {
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
// Accepts array of student objects from Excel parse on frontend
export const bulkCreateStudents = async (req, res, next) => {
  try {
    const { batchId, students } = req.body;
    const adminId = req.admin._id;

    if (!batchId || !students?.length) {
      return next(handleErrors(400, "Batch ID and students array are required"));
    }

    const batch = await Batch.findOne({ _id: batchId, adminId });
    if (!batch) return next(handleErrors(404, "Batch not found"));

    const toInsert = students.map((s) => ({
      name:       s.name?.trim()       || "Unknown",
      fatherName: s.fatherName?.trim() || "Unknown",
      motherName: s.motherName?.trim() || "",
      phone:      s.phone?.toString().trim() || "",
      schoolName: s.schoolName?.trim() || "",
      address:    s.address?.trim()    || "",
      DOB:        s.DOB || "",
      batchId:    batch._id,
      batchName:  batch.batchName,
      coachId:    batch.coachId || null,
      adminId,
      monthlyFee: s.monthlyFee || batch.fee || 0,
      createdBy:  req.admin.name,
    }));

    const inserted = await Student.insertMany(toInsert, { ordered: false });

    res.status(201).json({
      success: true,
      message: `${inserted.length} students enrolled`,
      count: inserted.length,
    });
  } catch (err) {
    next(err);
  }
};