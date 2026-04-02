// =============================================================
// FILE: src/controllers/coach/dashboard.controller.js
// PURPOSE: Coach dashboard KPIs. Returns the coach's assigned
//          batches, total students, today's attendance status
//          (marked or not), and this month's fee summary.
// =============================================================

import Coach from "../../models/coach.model.js";
import Student from "../../models/student.model.js";
import Batch from "../../models/batch.model.js";
import handleErrors from "../../middleware/handleErrors.js";

export const getCoachDashboard = async (req, res, next) => {
  try {
    const coachId = req.coach._id;
    const adminId = req.coach.adminId;

    const coach = await Coach.findById(coachId)
      .populate("assignedBatches", "batchName timing status weekDays startTime endTime");

    const activeBatches = coach.assignedBatches.filter((b) => b.status === "active");

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const batchStats = await Promise.all(
      activeBatches.map(async (batch) => {
        const students = await Student.find({
          batchId: batch._id,
          status: "active",
        }).select("attendance fee monthlyFee");

        const totalStudents = students.length;

        // Check if attendance is marked today
        const markedToday = students.filter((s) =>
          s.attendance.some((a) => {
            const d = new Date(a.date);
            d.setHours(0, 0, 0, 0);
            return d.getTime() === today.getTime();
          })
        ).length;

        // Current month fee stats
        const currentMonth = today.toLocaleString("en-IN", { month: "long" }) + " " + today.getFullYear();
        let feePaid = 0, feePending = 0;
        students.forEach((s) => {
          const entry = s.fee.find((f) => f.month === currentMonth);
          if (entry?.status === "paid") feePaid++;
          else feePending++;
        });

        return {
          batchId:      batch._id,
          batchName:    batch.batchName,
          timing:       batch.timing,
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
      coach: { name: coach.name, email: coach.email, profile: coach.profile },
      totalBatches:  activeBatches.length,
      totalStudents: batchStats.reduce((s, b) => s + b.totalStudents, 0),
      batchStats,
    });
  } catch (err) {
    next(err);
  }
};


// =============================================================
// FILE: src/controllers/coach/attendance.controller.js
// PURPOSE: Coach marks attendance for their assigned batches.
//          Scope-checked: coach can only access students in
//          their own batches. Uses same logic as admin controller
//          but scoped to req.coach.
// =============================================================

export const coachMarkAttendance = async (req, res, next) => {
  try {
    const { batchId, date, records } = req.body;
    const coachId = req.coach._id;
    const adminId = req.coach.adminId;

    if (!batchId || !date || !records?.length) {
      return next(handleErrors(400, "batchId, date and records are required"));
    }

    // Verify this batch belongs to this coach
    const batch = await Batch.findOne({ _id: batchId, coachId, adminId });
    if (!batch) return next(handleErrors(403, "You are not assigned to this batch"));

    const attendanceDate = new Date(date);
    attendanceDate.setHours(0, 0, 0, 0);

    const results = await Promise.all(
      records.map(async ({ studentId, status, remark }) => {
        const student = await Student.findOne({
          _id: studentId,
          batchId,
          coachId,
        });
        if (!student) return { studentId, error: "Not found or not your student" };

        student.attendance = student.attendance.filter((a) => {
          const d = new Date(a.date);
          d.setHours(0, 0, 0, 0);
          return d.getTime() !== attendanceDate.getTime();
        });

        student.attendance.push({
          date:          attendanceDate,
          status,
          remark:        remark || "",
          markedBy:      coachId,
          markedByModel: "Coach",
        });

        await student.save({ validateBeforeSave: false });
        return { studentId, status, success: true };
      })
    );

    res.status(200).json({ success: true, message: "Attendance marked", results });
  } catch (err) {
    next(err);
  }
};

export const coachGetBatchAttendance = async (req, res, next) => {
  try {
    const { batchId } = req.params;
    const { date } = req.query;
    const coachId = req.coach._id;

    const batch = await Batch.findOne({ _id: batchId, coachId });
    if (!batch) return next(handleErrors(403, "Not your batch"));

    const students = await Student.find({ batchId, coachId, status: "active" })
      .select("name phone profile attendance");

    if (!date) return res.status(200).json({ success: true, batch, students });

    const targetDate = new Date(date);
    targetDate.setHours(0, 0, 0, 0);

    const records = students.map((s) => {
      const record = s.attendance.find((a) => {
        const d = new Date(a.date);
        d.setHours(0, 0, 0, 0);
        return d.getTime() === targetDate.getTime();
      });
      return {
        studentId: s._id,
        name:      s.name,
        phone:     s.phone,
        profile:   s.profile,
        status:    record?.status || null,
        remark:    record?.remark || "",
        marked:    !!record,
      };
    });

    res.status(200).json({ success: true, batch, date, records });
  } catch (err) {
    next(err);
  }
};


// =============================================================
// FILE: src/controllers/coach/fees.controller.js
// PURPOSE: Coach collects fees for students in their batches.
//          Cannot generate fees (admin only).
//          Cannot access students outside their batches.
// =============================================================

export const coachCollectFee = async (req, res, next) => {
  try {
    const { studentId, month, amount, paymentMethod, remarks } = req.body;
    const coachId = req.coach._id;
    const adminId = req.coach.adminId;

    if (!studentId || !month?.trim() || !amount) {
      return next(handleErrors(400, "studentId, month and amount are required"));
    }
    if (amount <= 0) return next(handleErrors(400, "Amount must be greater than 0"));

    // Scope check — coach can only collect from their students
    const student = await Student.findOne({ _id: studentId, coachId, adminId });
    if (!student) return next(handleErrors(403, "Not your student"));

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

    res.status(200).json({
      success: true,
      message: excess > 0
        ? `Payment collected. ₹${excess} added to advance balance.`
        : "Payment collected successfully",
      feeEntry,
      advanceBalance: student.advanceBalance,
    });
  } catch (err) {
    next(err);
  }
};

export const coachGetBatchFees = async (req, res, next) => {
  try {
    const { batchId } = req.params;
    const { month } = req.query;
    const coachId = req.coach._id;

    const batch = await Batch.findOne({ _id: batchId, coachId });
    if (!batch) return next(handleErrors(403, "Not your batch"));

    const students = await Student.find({ batchId, coachId, status: "active" })
      .select("name phone monthlyFee advanceBalance fee");

    const data = students.map((s) => {
      const feeEntry = month ? s.fee.find((f) => f.month === month.trim()) : null;
      return {
        studentId:      s._id,
        name:           s.name,
        phone:          s.phone,
        monthlyFee:     s.monthlyFee,
        advanceBalance: s.advanceBalance,
        feeEntry:       feeEntry || null,
      };
    });

    res.status(200).json({ success: true, batch, data });
  } catch (err) {
    next(err);
  }
};