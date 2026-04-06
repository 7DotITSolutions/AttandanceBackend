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


