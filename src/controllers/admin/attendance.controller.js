// =============================================================
// FILE: src/controllers/admin/attendance.controller.js
// PURPOSE: Admin marks and views attendance for any batch.
//          markAttendance accepts array of student statuses
//          for a given date — bulk operation for whole batch.
//          getAttendance returns all records for a batch+date.
//          getStudentAttendance returns full history for one
//          student with monthly summary.
// =============================================================

import Student from "../../models/student.model.js";
import Batch from "../../models/batch.model.js";
import handleErrors from "../../middleware/handleErrors.js";

// ── POST /admin/attendance/mark ───────────────────────────
// Body: { batchId, date, records: [{ studentId, status, remark }] }
export const markAttendance = async (req, res, next) => {
  try {
    const { batchId, date, records } = req.body;
    const adminId = req.admin._id;

    if (!batchId || !date || !records?.length) {
      return next(handleErrors(400, "batchId, date and records are required"));
    }

    const batch = await Batch.findOne({ _id: batchId, adminId });
    if (!batch) return next(handleErrors(404, "Batch not found"));

    const attendanceDate = new Date(date);
    attendanceDate.setHours(0, 0, 0, 0);

    const results = await Promise.all(
      records.map(async ({ studentId, status, remark }) => {
        const student = await Student.findOne({ _id: studentId, batchId, adminId });
        if (!student) return { studentId, error: "Not found" };

        // Remove existing record for this date if any
        student.attendance = student.attendance.filter((a) => {
          const d = new Date(a.date);
          d.setHours(0, 0, 0, 0);
          return d.getTime() !== attendanceDate.getTime();
        });

        student.attendance.push({
          date:          attendanceDate,
          status,
          remark:        remark || "",
          markedBy:      adminId,
          markedByModel: "Admin",
        });

        await student.save({ validateBeforeSave: false });
        return { studentId, status, success: true };
      })
    );

    res.status(200).json({
      success: true,
      message: "Attendance marked",
      results,
    });
  } catch (err) {
    next(err);
  }
};

// ── GET /admin/attendance/batch/:batchId ──────────────────
// Query: ?date=2025-01-15
export const getBatchAttendance = async (req, res, next) => {
  try {
    const { batchId } = req.params;
    const { date } = req.query;
    const adminId = req.admin._id;

    const batch = await Batch.findOne({ _id: batchId, adminId });
    if (!batch) return next(handleErrors(404, "Batch not found"));

    const students = await Student.find({ batchId, adminId, status: "active" })
      .select("name phone profile attendance");

    if (!date) {
      // Return all students with full attendance arrays
      return res.status(200).json({ success: true, batch, students });
    }

    const targetDate = new Date(date);
    targetDate.setHours(0, 0, 0, 0);

    // Map each student to their record for this date
    const records = students.map((s) => {
      const record = s.attendance.find((a) => {
        const d = new Date(a.date);
        d.setHours(0, 0, 0, 0);
        return d.getTime() === targetDate.getTime();
      });
      return {
        studentId:   s._id,
        name:        s.name,
        phone:       s.phone,
        profile:     s.profile,
        status:      record?.status || null,
        remark:      record?.remark || "",
        marked:      !!record,
      };
    });

    res.status(200).json({ success: true, batch, date, records });
  } catch (err) {
    next(err);
  }
};

// ── GET /admin/attendance/student/:studentId ──────────────
// Query: ?month=January 2025
export const getStudentAttendance = async (req, res, next) => {
  try {
    const student = await Student.findOne({
      _id: req.params.studentId,
      adminId: req.admin._id,
    }).select("name batchName attendance");

    if (!student) return next(handleErrors(404, "Student not found"));

    const { month } = req.query;
    let attendance = student.attendance;

    if (month) {
      const [monthName, year] = month.split(" ");
      const monthIndex = new Date(`${monthName} 1 ${year}`).getMonth();
      const yearNum    = parseInt(year);

      attendance = attendance.filter((a) => {
        const d = new Date(a.date);
        return d.getMonth() === monthIndex && d.getFullYear() === yearNum;
      });
    }

    const total   = attendance.length;
    const present = attendance.filter((a) => a.status === "present").length;
    const absent  = attendance.filter((a) => a.status === "absent").length;
    const leave   = attendance.filter((a) => a.status === "leave").length;

    res.status(200).json({
      success: true,
      student: { _id: student._id, name: student.name, batchName: student.batchName },
      attendance,
      summary: {
        total, present, absent, leave,
        percentage: total ? Math.round((present / total) * 100) : 0,
      },
    });
  } catch (err) {
    next(err);
  }
};