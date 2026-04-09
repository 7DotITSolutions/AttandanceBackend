// =============================================================
// FILE: src/controllers/coach/coach.controller.js
// PURPOSE: Coach dashboard, attendance marking, fee collection.
//          All three are in one file because coach.routes.js
//          imports them all from here.
// FIX: getCoachDashboard now fetches batches directly from
//      Batch collection using coachId filter — more reliable
//      than relying solely on coach.assignedBatches array.
// =============================================================

// =============================================================
// FILE: src/controllers/coach/coach.controller.js
// PURPOSE: Coach dashboard, attendance, fee collection.
//          coachCollectFee now auto-sends WhatsApp confirmation.
// =============================================================

import Coach   from "../../models/coach.model.js";
import Student from "../../models/student.model.js";
import Batch   from "../../models/batch.model.js";
import Admin   from "../../models/admin.model.js";
import handleErrors from "../../middleware/handleErrors.js";
import { sendFeeCollectedMsg } from "../../utils/sendWhatsApp.js";

const getInstitutionName = async (adminId) => {
  const admin = await Admin.findById(adminId).select("name");
  return admin?.name || process.env.INSTITUTION_NAME || "Your Institute";
};

// =============================================================
// DASHBOARD
// =============================================================
export const getCoachDashboard = async (req, res, next) => {
  try {
    const coachId = req.coach._id;
    const adminId = req.coach.adminId;

    const coach = await Coach.findById(coachId);
    if (!coach) return next(handleErrors(404, "Coach not found"));

    const activeBatches = await Batch.find({ coachId, adminId, status: "active" })
      .select("batchName timing startTime endTime weekDays status");

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const currentMonth =
      today.toLocaleString("en-IN", { month: "long" }) + " " + today.getFullYear();

    const batchStats = await Promise.all(
      activeBatches.map(async (batch) => {
        const students = await Student.find({
          batchId: batch._id, coachId, status: "active",
        }).select("attendance fee monthlyFee");

        const totalStudents = students.length;
        const markedToday   = students.filter((s) =>
          s.attendance.some((a) => {
            const d = new Date(a.date); d.setHours(0,0,0,0);
            return d.getTime() === today.getTime();
          })
        ).length;

        let feePaid = 0, feePending = 0;
        students.forEach((s) => {
          const e = s.fee.find((f) => f.month === currentMonth);
          if (e?.status === "paid") feePaid++;
          else feePending++;
        });

        return {
          batchId:               batch._id,
          batchName:             batch.batchName,
          timing:                batch.timing || `${batch.startTime||""} - ${batch.endTime||""}`,
          totalStudents,
          attendanceMarkedToday: markedToday,
          attendancePending:     totalStudents - markedToday,
          currentMonth,
          feePaid,
          feePending,
        };
      })
    );

    res.status(200).json({
      success: true,
      coach:   { name: coach.name, email: coach.email, profile: coach.profile },
      totalBatches:  activeBatches.length,
      totalStudents: batchStats.reduce((s, b) => s + b.totalStudents, 0),
      batchStats,
    });
  } catch (err) { next(err); }
};

// =============================================================
// ATTENDANCE
// =============================================================
export const coachMarkAttendance = async (req, res, next) => {
  try {
    const { batchId, date, records } = req.body;
    const coachId = req.coach._id;
    const adminId = req.coach.adminId;

    if (!batchId || !date || !records?.length) {
      return next(handleErrors(400, "batchId, date and records are required"));
    }

    const batch = await Batch.findOne({ _id: batchId, coachId, adminId });
    if (!batch) return next(handleErrors(403, "You are not assigned to this batch"));

    const attendanceDate = new Date(date);
    attendanceDate.setHours(0, 0, 0, 0);

    const results = await Promise.all(
      records.map(async ({ studentId, status, remark }) => {
        const student = await Student.findOne({ _id: studentId, batchId, coachId });
        if (!student) return { studentId, error: "Not found or not your student" };

        student.attendance = student.attendance.filter((a) => {
          const d = new Date(a.date); d.setHours(0,0,0,0);
          return d.getTime() !== attendanceDate.getTime();
        });
        student.attendance.push({
          date: attendanceDate, status,
          remark: remark || "", markedBy: coachId, markedByModel: "Coach",
        });
        await student.save({ validateBeforeSave: false });
        return { studentId, status, success: true };
      })
    );

    res.status(200).json({
      success: true,
      message: `Attendance marked for ${results.filter((r) => r.success).length} students`,
      results,
    });
  } catch (err) { next(err); }
};

export const coachGetBatchAttendance = async (req, res, next) => {
  try {
    const { batchId } = req.params;
    const { date }    = req.query;
    const coachId     = req.coach._id;

    const batch = await Batch.findOne({ _id: batchId, coachId });
    if (!batch) return next(handleErrors(403, "Not your batch"));

    const students = await Student.find({ batchId, coachId, status: "active" })
      .select("name fatherName phone profile attendance");

    if (!date) return res.status(200).json({ success: true, batch, students });

    const targetDate = new Date(date);
    targetDate.setHours(0, 0, 0, 0);

    const records = students.map((s) => {
      const record = s.attendance.find((a) => {
        const d = new Date(a.date); d.setHours(0,0,0,0);
        return d.getTime() === targetDate.getTime();
      });
      return {
        studentId: s._id, name: s.name, fatherName: s.fatherName,
        phone: s.phone, profile: s.profile,
        status: record?.status || null, remark: record?.remark || "", marked: !!record,
      };
    });

    res.status(200).json({ success: true, batch, date, records });
  } catch (err) { next(err); }
};

// =============================================================
// FEES
// =============================================================
export const coachCollectFee = async (req, res, next) => {
  try {
    const { studentId, month, amount, paymentMethod, remarks } = req.body;
    const coachId = req.coach._id;
    const adminId = req.coach.adminId;

    if (!studentId || !month?.trim() || !amount) {
      return next(handleErrors(400, "studentId, month and amount are required"));
    }
    if (Number(amount) <= 0) return next(handleErrors(400, "Amount must be greater than 0"));

    const student = await Student.findOne({ _id: studentId, coachId, adminId });
    if (!student) return next(handleErrors(403, "Student not found or not in your batch"));

    const feeEntry = student.fee.find((f) => f.month === month.trim());
    if (!feeEntry) {
      return next(handleErrors(404, "Fee not generated for this month. Ask admin to generate."));
    }

    const prevPaid = feeEntry.paidAmount || 0;
    const total    = prevPaid + Number(amount);
    const excess   = total - feeEntry.monthlyFee;

    if (excess > 0) {
      feeEntry.paidAmount    = feeEntry.monthlyFee;
      student.advanceBalance = (student.advanceBalance || 0) + excess;
    } else {
      feeEntry.paidAmount = total;
    }

    feeEntry.paymentDate      = new Date();
    feeEntry.paymentMethod    = paymentMethod || "cash";
    feeEntry.collectedBy      = coachId;
    feeEntry.collectedByModel = "Coach";
    feeEntry.remarks          = remarks?.trim() || "";

    if (feeEntry.paidAmount >= feeEntry.monthlyFee && !feeEntry.receiptNo) {
      const { default: generateReceiptNo } = await import("../../utils/generateReceipt.js");
      feeEntry.receiptNo = await generateReceiptNo(adminId.toString(), month);
    }

    await student.save();

    // ── Auto WhatsApp confirmation ────────────────────────
    const remaining       = Math.max(0, feeEntry.monthlyFee - feeEntry.paidAmount);
    const institutionName = await getInstitutionName(adminId);
    sendFeeCollectedMsg({
      phone:            student.phone,
      studentName:      student.name,
      month,
      amountPaid:       Number(amount),
      receiptNo:        feeEntry.receiptNo || "",
      remainingBalance: remaining,
      institutionName,
    }).catch((e) => console.error("WhatsApp fee-collected failed:", e.message));

    res.status(200).json({
      success: true,
      message: excess > 0
        ? `Payment collected. ₹${excess} added to advance balance.`
        : "Payment collected successfully",
      feeEntry,
      advanceBalance: student.advanceBalance,
    });
  } catch (err) { next(err); }
};

export const coachGetBatchFees = async (req, res, next) => {
  try {
    const { batchId } = req.params;
    const { month }   = req.query;
    const coachId     = req.coach._id;

    const batch = await Batch.findOne({ _id: batchId, coachId });
    if (!batch) return next(handleErrors(403, "Not your batch"));

    const students = await Student.find({ batchId, coachId, status: "active" })
      .select("name phone monthlyFee advanceBalance fee");

    const data = students.map((s) => {
      const feeEntry = month ? s.fee.find((f) => f.month === month.trim()) : null;
      return {
        studentId: s._id, name: s.name, phone: s.phone,
        monthlyFee: s.monthlyFee, advanceBalance: s.advanceBalance,
        feeEntry: feeEntry || null,
      };
    });

    res.status(200).json({ success: true, batch, data });
  } catch (err) { next(err); }
};