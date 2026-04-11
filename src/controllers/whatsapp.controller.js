// =============================================================
// FILE: src/controllers/whatsapp.controller.js
// PURPOSE: All WhatsApp reminder endpoints.
//
//   GET  /whatsapp/batches                       — batch list for sidebar
//   POST /whatsapp/fee-reminder                  — all students in a batch
//   POST /whatsapp/fee-reminder-single           — one specific student (defaulters list)
//   POST /whatsapp/fee-reminder-all-defaulters   — all defaulters for a month
//   POST /whatsapp/fee-collected                 — auto after fee collection
// =============================================================

import Student from "../models/student.model.js";
import Batch   from "../models/batch.model.js";
import Admin   from "../models/admin.model.js";
import handleErrors from "../middleware/handleErrors.js";
import {
  sendFeeReminder,
  sendFeeCollectedMsg,
} from "../utils/sendWhatsApp.js";

// ── Helpers ───────────────────────────────────────────────
const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

const getInstitutionName = async (adminId) => {
  const admin = await Admin.findById(adminId).select("name");
  return admin?.name || process.env.INSTITUTION_NAME || "Your Institute";
};

const getPrevAndCurrentMonth = () => {
  const now      = new Date();
  const curIdx   = now.getMonth();
  const prevIdx  = curIdx === 0 ? 11 : curIdx - 1;
  const curYear  = now.getFullYear();
  const prevYear = curIdx === 0 ? curYear - 1 : curYear;
  return {
    currentMonth:  `${MONTHS[curIdx]} ${curYear}`,
    lastMonth:     `${MONTHS[prevIdx]} ${prevYear}`,
    lastMonthName:  MONTHS[prevIdx],
  };
};

// Build attendance + fee payload for one student
const buildReminderPayload = (
  student, batch, month, lastMonth, lastMonthName, institutionName
) => {
  const lastMonthRecords = (student.attendance || []).filter((a) => {
    const d = new Date(a.date);
    return `${MONTHS[d.getMonth()]} ${d.getFullYear()}` === lastMonth;
  });
  const total   = lastMonthRecords.length;
  const present = lastMonthRecords.filter((a) => a.status === "present").length;
  const absent  = lastMonthRecords.filter((a) => a.status === "absent").length;
  const leave   = lastMonthRecords.filter((a) => a.status === "leave").length;
  const pct     = total ? Math.round((present / total) * 100) : 0;

  const feeEntry   = (student.fee || []).find((f) => f.month === month);
  const monthlyFee = feeEntry?.monthlyFee ?? student.monthlyFee ?? batch?.fee ?? 0;

  return {
    phone:          student.phone,
    studentName:    student.name,
    fatherName:     student.fatherName,
    currentMonth:   month,
    monthlyFee,
    lastMonthName,
    present, absent, leave, total,
    percentage:     pct,
    institutionName,
  };
};

// ── GET /whatsapp/batches ─────────────────────────────────
export const getReminderBatches = async (req, res, next) => {
  try {
    const adminId = req.user.adminId;
    const filter  = { adminId, status: "active" };
    if (req.user.role === "coach") filter.coachId = req.user.id;
    const batches = await Batch.find(filter).select("batchName timing");
    res.status(200).json({ success: true, batches });
  } catch (err) { next(err); }
};

// ── POST /whatsapp/fee-reminder ───────────────────────────
// Sends to ALL active students in a batch
// Body: { batchId }
export const sendBatchFeeReminder = async (req, res, next) => {
  try {
    const { batchId } = req.body;
    const adminId     = req.user.adminId;

    if (!batchId) return next(handleErrors(400, "batchId is required"));

    const batch = await Batch.findOne({ _id: batchId, adminId });
    if (!batch) return next(handleErrors(404, "Batch not found"));

    const institutionName = await getInstitutionName(adminId);
    const { currentMonth, lastMonth, lastMonthName } = getPrevAndCurrentMonth();

    const students = await Student.find({ batchId, status: "active" })
      .select("name fatherName phone fee attendance monthlyFee");

    if (!students.length) {
      return next(handleErrors(400, "No active students in this batch"));
    }

    let sent = 0, failed = 0, skipped = 0;

    for (const student of students) {
      if (!student.phone) { skipped++; continue; }
      const payload = buildReminderPayload(
        student, batch, currentMonth, lastMonth, lastMonthName, institutionName
      );
      const result = await sendFeeReminder(payload);
      if (result.success) sent++; else failed++;
      await Student.findByIdAndUpdate(student._id, {
        lastFeeReminderSentAt: new Date(),
      });
    }

    res.status(200).json({
      success: true,
      message: `Sent: ${sent} ✓  Failed: ${failed}  Skipped (no phone): ${skipped}`,
      sent, failed, skipped,
    });
  } catch (err) { next(err); }
};

// ── POST /whatsapp/fee-reminder-single ───────────────────
// Sends to ONE specific student — used by "📱 Remind" button
// in the defaulters list in Reports.jsx
// Body: { studentId, month }
export const sendSingleFeeReminder = async (req, res, next) => {
  try {
    const { studentId, month } = req.body;
    const adminId = req.user.adminId;

    if (!studentId) return next(handleErrors(400, "studentId is required"));

    const student = await Student.findOne({ _id: studentId, adminId })
      .select("name fatherName phone fee attendance monthlyFee batchId");

    if (!student) return next(handleErrors(404, "Student not found"));
    if (!student.phone) {
      return next(
        handleErrors(400, `${student.name} has no phone number — cannot send WhatsApp`)
      );
    }

    const batch = await Batch.findById(student.batchId).select("fee batchName");
    const institutionName = await getInstitutionName(adminId);
    const { lastMonth, lastMonthName, currentMonth } = getPrevAndCurrentMonth();

    // Use provided month or current month
    const targetMonth = month?.trim() || currentMonth;

    const payload = buildReminderPayload(
      student, batch, targetMonth, lastMonth, lastMonthName, institutionName
    );
    const result = await sendFeeReminder(payload);

    if (!result.success) {
      return next(handleErrors(500, result.error || "WhatsApp send failed"));
    }

    await Student.findByIdAndUpdate(student._id, {
      lastFeeReminderSentAt: new Date(),
    });

    res.status(200).json({
      success: true,
      message: `Reminder sent to ${student.name}`,
      dev:     result.dev || false,
    });
  } catch (err) { next(err); }
};

// ── POST /whatsapp/fee-reminder-all-defaulters ────────────
// Sends to ALL defaulters (pending/partial) for a month
// Used by "Remind All" button in defaulters tab
// Body: { month, batchId? }
export const sendAllDefaultersReminder = async (req, res, next) => {
  try {
    const { month, batchId } = req.body;
    const adminId = req.user.adminId;

    if (!month?.trim()) return next(handleErrors(400, "month is required"));

    const institutionName = await getInstitutionName(adminId);
    const { lastMonth, lastMonthName } = getPrevAndCurrentMonth();

    // Base filter
    const studentFilter = { adminId, status: "active" };
    if (batchId) studentFilter.batchId = batchId;

    const allStudents = await Student.find(studentFilter)
      .select("name fatherName phone fee attendance monthlyFee batchId");

    // Keep only defaulters for this month
    const defaulters = allStudents.filter((s) => {
      const entry = s.fee.find((f) => f.month === month.trim());
      if (!entry) return true; // fee not even generated = defaulter
      return entry.status === "pending" || entry.status === "partial";
    });

    if (!defaulters.length) {
      return res.status(200).json({
        success: true,
        message: `No defaulters found for ${month} 🎉`,
        sent: 0, failed: 0, skipped: 0,
      });
    }

    let sent = 0, failed = 0, skipped = 0;

    for (const student of defaulters) {
      if (!student.phone) { skipped++; continue; }

      const batch = await Batch.findById(student.batchId).select("fee");
      const payload = buildReminderPayload(
        student, batch, month.trim(), lastMonth, lastMonthName, institutionName
      );
      const result = await sendFeeReminder(payload);
      if (result.success) sent++; else failed++;

      await Student.findByIdAndUpdate(student._id, {
        lastFeeReminderSentAt: new Date(),
      });
    }

    res.status(200).json({
      success: true,
      message: `Sent: ${sent} ✓  Failed: ${failed}  Skipped (no phone): ${skipped}  Total defaulters: ${defaulters.length}`,
      sent, failed, skipped,
      totalDefaulters: defaulters.length,
    });
  } catch (err) { next(err); }
};

// ── POST /whatsapp/fee-collected ──────────────────────────
// Auto-called from fees.controller after fee collection
export const notifyFeeCollected = async (req, res, next) => {
  try {
    const { studentId, month, amountPaid, receiptNo, remainingBalance } = req.body;
    const adminId = req.user.adminId;

    const student = await Student.findOne({ _id: studentId, adminId })
      .select("name phone");
    if (!student) return next(handleErrors(404, "Student not found"));
    if (!student.phone) {
      return res.status(200).json({ success: true, message: "No phone — skipped" });
    }

    const institutionName = await getInstitutionName(adminId);
    const result = await sendFeeCollectedMsg({
      phone:            student.phone,
      studentName:      student.name,
      month,
      amountPaid,
      receiptNo:        receiptNo || "",
      remainingBalance: remainingBalance || 0,
      institutionName,
    });

    res.status(200).json({
      success: result.success,
      message: result.success ? "WhatsApp sent" : "WhatsApp failed",
      dev:     result.dev || false,
    });
  } catch (err) { next(err); }
};