// =============================================================
// FILE: src/controllers/admin/reports.controller.js
// PURPOSE: Generates reports for attendance and fees.
//          attendanceReport → per-student % for date range.
//          feeReport → monthly collection summary by batch.
//          defaultersList → students with pending/partial fees.
//          exportData → returns structured JSON for frontend
//          to convert to PDF or Excel using jspdf / xlsx.
// =============================================================

import Student from "../../models/student.model.js";
import Batch from "../../models/batch.model.js";
import handleErrors from "../../middleware/handleErrors.js";

// ── GET /admin/reports/attendance ─────────────────────────
// Query: ?batchId=&month=January 2025
export const attendanceReport = async (req, res, next) => {
  try {
    const { batchId, month } = req.query;
    const adminId = req.admin._id;

    const filter = { adminId, status: "active" };
    if (batchId) filter.batchId = batchId;

    const students = await Student.find(filter)
      .select("name phone batchName attendance");

    const report = students.map((s) => {
      let records = s.attendance;

      if (month) {
        const [monthName, year] = month.split(" ");
        const monthIndex = new Date(`${monthName} 1 ${year}`).getMonth();
        const yearNum    = parseInt(year);
        records = records.filter((a) => {
          const d = new Date(a.date);
          return d.getMonth() === monthIndex && d.getFullYear() === yearNum;
        });
      }

      const total   = records.length;
      const present = records.filter((a) => a.status === "present").length;
      const absent  = records.filter((a) => a.status === "absent").length;
      const leave   = records.filter((a) => a.status === "leave").length;

      return {
        studentId:  s._id,
        name:       s.name,
        phone:      s.phone,
        batchName:  s.batchName,
        total, present, absent, leave,
        percentage: total ? Math.round((present / total) * 100) : 0,
      };
    });

    // Sort by attendance % ascending (worst first)
    report.sort((a, b) => a.percentage - b.percentage);

    res.status(200).json({ success: true, month, report, total: report.length });
  } catch (err) {
    next(err);
  }
};

// ── GET /admin/reports/fees ───────────────────────────────
// Query: ?month=January 2025
export const feeReport = async (req, res, next) => {
  try {
    const { month } = req.query;
    const adminId   = req.admin._id;

    if (!month?.trim()) return next(handleErrors(400, "Month is required"));

    const batches = await Batch.find({ adminId, status: "active" });

    const report = await Promise.all(
      batches.map(async (batch) => {
        const students = await Student.find({
          batchId: batch._id,
          adminId,
          status: "active",
        }).select("name fee monthlyFee");

        let collected = 0, due = 0, paid = 0, partial = 0, pending = 0;

        students.forEach((s) => {
          const entry = s.fee.find((f) => f.month === month.trim());
          if (entry) {
            collected += entry.paidAmount || 0;
            due       += entry.monthlyFee || 0;
            if (entry.status === "paid")    paid++;
            if (entry.status === "partial") partial++;
            if (entry.status === "pending") pending++;
          } else {
            pending++;
          }
        });

        return {
          batchId:   batch._id,
          batchName: batch.batchName,
          timing:    batch.timing,
          students:  students.length,
          collected, due,
          outstanding: due - collected,
          paid, partial, pending,
        };
      })
    );

    const totals = report.reduce(
      (acc, b) => ({
        collected:   acc.collected   + b.collected,
        due:         acc.due         + b.due,
        outstanding: acc.outstanding + b.outstanding,
      }),
      { collected: 0, due: 0, outstanding: 0 }
    );

    res.status(200).json({ success: true, month, report, totals });
  } catch (err) {
    next(err);
  }
};

// ── GET /admin/reports/defaulters ─────────────────────────
// Query: ?month=January 2025&batchId=
export const defaultersList = async (req, res, next) => {
  try {
    const { month, batchId } = req.query;
    const adminId = req.admin._id;

    if (!month?.trim()) return next(handleErrors(400, "Month is required"));

    const filter = { adminId, status: "active" };
    if (batchId) filter.batchId = batchId;

    const students = await Student.find(filter)
      .select("name phone fatherName batchName fee monthlyFee advanceBalance lastFeeReminderSentAt");

    const defaulters = students
      .map((s) => {
        const entry = s.fee.find((f) => f.month === month.trim());
        const outstanding = entry
          ? (entry.monthlyFee - entry.paidAmount)
          : s.monthlyFee;

        return {
          studentId:    s._id,
          name:         s.name,
          phone:        s.phone,
          fatherName:   s.fatherName,
          batchName:    s.batchName,
          monthlyFee:   s.monthlyFee,
          paidAmount:   entry?.paidAmount || 0,
          outstanding:  Math.max(0, outstanding),
          status:       entry?.status || "not generated",
          lastReminder: s.lastFeeReminderSentAt,
        };
      })
      .filter((s) => s.outstanding > 0);

    defaulters.sort((a, b) => b.outstanding - a.outstanding);

    res.status(200).json({
      success: true,
      month,
      defaulters,
      total:       defaulters.length,
      totalDue:    defaulters.reduce((s, d) => s + d.outstanding, 0),
    });
  } catch (err) {
    next(err);
  }
};

// ── GET /admin/reports/export ─────────────────────────────
// Returns raw data — frontend converts to PDF or Excel
// Query: ?type=attendance|fees&month=January 2025&batchId=
export const exportReport = async (req, res, next) => {
  try {
    const { type, month, batchId } = req.query;
    const adminId = req.admin._id;

    if (!type || !month) {
      return next(handleErrors(400, "type and month are required"));
    }

    const filter = { adminId, status: "active" };
    if (batchId) filter.batchId = batchId;

    const students = await Student.find(filter)
      .select("name phone fatherName batchName attendance fee monthlyFee");

    let rows = [];

    if (type === "attendance") {
      const [monthName, year] = month.split(" ");
      const monthIndex = new Date(`${monthName} 1 ${year}`).getMonth();
      const yearNum    = parseInt(year);

      rows = students.map((s) => {
        const records = s.attendance.filter((a) => {
          const d = new Date(a.date);
          return d.getMonth() === monthIndex && d.getFullYear() === yearNum;
        });
        const present = records.filter((a) => a.status === "present").length;
        const total   = records.length;
        return {
          Name:       s.name,
          Phone:      s.phone,
          Batch:      s.batchName,
          Present:    present,
          Absent:     records.filter((a) => a.status === "absent").length,
          Leave:      records.filter((a) => a.status === "leave").length,
          Total:      total,
          Percentage: total ? `${Math.round((present / total) * 100)}%` : "0%",
        };
      });
    }

    if (type === "fees") {
      rows = students.map((s) => {
        const entry = s.fee.find((f) => f.month === month.trim());
        return {
          Name:           s.name,
          "Father Name":  s.fatherName,
          Phone:          s.phone,
          Batch:          s.batchName,
          "Monthly Fee":  s.monthlyFee,
          "Paid Amount":  entry?.paidAmount || 0,
          Outstanding:    Math.max(0, s.monthlyFee - (entry?.paidAmount || 0)),
          Status:         entry?.status || "not generated",
          "Receipt No":   entry?.receiptNo || "",
          "Payment Date": entry?.paymentDate ? new Date(entry.paymentDate).toLocaleDateString("en-IN") : "",
        };
      });
    }

    res.status(200).json({ success: true, type, month, rows });
  } catch (err) {
    next(err);
  }
};