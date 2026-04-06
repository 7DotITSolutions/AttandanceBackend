
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

