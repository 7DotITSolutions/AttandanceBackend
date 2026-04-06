
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