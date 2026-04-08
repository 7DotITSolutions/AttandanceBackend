// =============================================================
// FILE: src/controllers/whatsapp.controller.js
// PURPOSE: WhatsApp reminder endpoints.
//          POST /whatsapp/fee-reminder  — manual trigger for a batch+month
//            Sends last month's attendance + current month fee to all students
//          POST /whatsapp/fee-collected — auto-called after fee collection
//            Sends payment confirmation to parent
// Both admin and coach can call these (authenticateBoth middleware).
// =============================================================

import Student from "../models/student.model.js";
import Batch   from "../models/batch.model.js";
import Admin   from "../models/admin.model.js";
import handleErrors from "../middleware/handleErrors.js";
import {
  sendFeeReminder,
  sendFeeCollectedMsg,
} from "../utils/sendWhatsApp.js";

// ── Helper: get institution name from adminId ─────────────
const getInstitutionName = async (adminId) => {
  const admin = await Admin.findById(adminId).select("name");
  return admin?.name || process.env.INSTITUTION_NAME || "Your Institute";
};

// ── Helper: get month names ───────────────────────────────
const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

const getPrevAndCurrentMonth = () => {
  const now     = new Date();
  const curIdx  = now.getMonth();
  const prevIdx = curIdx === 0 ? 11 : curIdx - 1;
  const curYear = now.getFullYear();
  const prevYear = curIdx === 0 ? curYear - 1 : curYear;
  return {
    currentMonth: `${MONTHS[curIdx]} ${curYear}`,
    lastMonth:    `${MONTHS[prevIdx]} ${prevYear}`,
    lastMonthName: MONTHS[prevIdx],
  };
};

// ── POST /whatsapp/fee-reminder ───────────────────────────
// Body: { batchId } — sends reminder to ALL students in batch
// Uses current month for fee info, previous month for attendance
export const sendBatchFeeReminder = async (req, res, next) => {
  try {
    const { batchId } = req.body;
    const adminId     = req.user.adminId;

    if (!batchId) return next(handleErrors(400, "batchId is required"));

    // Verify batch belongs to this admin
    const batch = await Batch.findOne({ _id: batchId, adminId });
    if (!batch) return next(handleErrors(404, "Batch not found"));

    const institutionName = await getInstitutionName(adminId);
    const { currentMonth, lastMonth, lastMonthName } = getPrevAndCurrentMonth();

    const students = await Student.find({
      batchId,
      status: "active",
    }).select("name fatherName phone fee attendance monthlyFee");

    if (!students.length) {
      return next(handleErrors(400, "No active students in this batch"));
    }

    let sent    = 0;
    let failed  = 0;
    let skipped = 0;

    for (const student of students) {
      if (!student.phone) { skipped++; continue; }

      // Get last month's attendance
      const lastMonthRecords = student.attendance.filter((a) => {
        const d = new Date(a.date);
        return `${MONTHS[d.getMonth()]} ${d.getFullYear()}` === lastMonth;
      });
      const total   = lastMonthRecords.length;
      const present = lastMonthRecords.filter((a) => a.status === "present").length;
      const absent  = lastMonthRecords.filter((a) => a.status === "absent").length;
      const leave   = lastMonthRecords.filter((a) => a.status === "leave").length;
      const pct     = total ? Math.round((present / total) * 100) : 0;

      // Get current month fee (may not exist yet if not generated)
      const feeEntry    = student.fee.find((f) => f.month === currentMonth);
      const monthlyFee  = feeEntry?.monthlyFee ?? student.monthlyFee ?? batch.fee ?? 0;

      const result = await sendFeeReminder({
        phone:           student.phone,
        studentName:     student.name,
        fatherName:      student.fatherName,
        currentMonth,
        monthlyFee,
        lastMonthName,
        present, absent, leave, total,
        percentage:      pct,
        institutionName,
      });

      if (result.success) sent++;
      else failed++;

      // Update last reminder timestamp
      await Student.findByIdAndUpdate(student._id, {
        lastFeeReminderSentAt: new Date(),
      });
    }

    res.status(200).json({
      success: true,
      message: `Reminders sent to ${sent} students. ${failed} failed. ${skipped} skipped (no phone).`,
      sent, failed, skipped,
      currentMonth,
      lastMonth,
    });
  } catch (err) {
    next(err);
  }
};

// ── POST /whatsapp/fee-collected ──────────────────────────
// Called automatically from fees.controller after collection
// Body: { studentId, month, amountPaid, receiptNo, remainingBalance }
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
  } catch (err) {
    next(err);
  }
};

// ── GET /whatsapp/batches ─────────────────────────────────
// Returns batches for the sidebar reminder dropdown
export const getReminderBatches = async (req, res, next) => {
  try {
    const adminId = req.user.adminId;
    const filter  = { adminId, status: "active" };

    // If coach, only their batches
    if (req.user.role === "coach") {
      filter.coachId = req.user.id;
    }

    const batches = await Batch.find(filter).select("batchName timing");

    res.status(200).json({ success: true, batches });
  } catch (err) {
    next(err);
  }
};