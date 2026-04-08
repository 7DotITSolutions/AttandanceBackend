// =============================================================
// FILE: src/controllers/admin/fees.controller.js
// PURPOSE: Admin fee management. After collectFee succeeds,
//          automatically sends WhatsApp confirmation to parent.
// =============================================================

import Student from "../../models/student.model.js";
import Batch   from "../../models/batch.model.js";
import Admin   from "../../models/admin.model.js";
import handleErrors       from "../../middleware/handleErrors.js";
import generateReceiptNo  from "../../utils/generateReceipt.js";
import { sendFeeCollectedMsg } from "../../utils/sendWhatsApp.js";

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

const getInstitutionName = async (adminId) => {
  const admin = await Admin.findById(adminId).select("name");
  return admin?.name || process.env.INSTITUTION_NAME || "Your Institute";
};

// ── POST /admin/fees/generate ─────────────────────────────
export const generateFees = async (req, res, next) => {
  try {
    const { batchId, month } = req.body;
    const adminId = req.admin._id;

    if (!batchId || !month?.trim()) {
      return next(handleErrors(400, "batchId and month are required"));
    }

    const batch = await Batch.findOne({ _id: batchId, adminId });
    if (!batch) return next(handleErrors(404, "Batch not found"));

    const students = await Student.find({ batchId, adminId, status: "active" });
    if (!students.length) {
      return next(handleErrors(400, "No active students in this batch"));
    }

    let generated = 0;
    let skipped   = 0;

    for (const student of students) {
      const exists = student.fee.find((f) => f.month === month.trim());
      if (exists) { skipped++; continue; }

      const due     = student.monthlyFee;
      const advance = student.advanceBalance || 0;
      const deduct  = Math.min(advance, due);
      const paid    = deduct;

      student.advanceBalance = advance - deduct;

      const receiptNo = paid >= due
        ? await generateReceiptNo(adminId.toString(), month)
        : "";

      student.fee.push({
        month:         month.trim(),
        monthlyFee:    due,
        paidAmount:    paid,
        paymentMethod: "cash",
        receiptNo,
        paymentDate:   paid >= due ? new Date() : null,
        collectedBy:   paid > 0 ? adminId : null,
        collectedByModel: paid > 0 ? "Admin" : null,
        remarks:       paid > 0 ? "Auto-deducted from advance balance" : "",
      });

      await student.save();
      generated++;
    }

    res.status(200).json({
      success: true,
      message: `Fees generated for ${generated} students. ${skipped} already existed.`,
      generated,
      skipped,
    });
  } catch (err) {
    next(err);
  }
};

// ── POST /admin/fees/collect ──────────────────────────────
export const collectFee = async (req, res, next) => {
  try {
    const { studentId, month, amount, paymentMethod, remarks } = req.body;
    const adminId = req.admin._id;

    if (!studentId || !month?.trim() || !amount) {
      return next(handleErrors(400, "studentId, month and amount are required"));
    }
    if (amount <= 0) return next(handleErrors(400, "Amount must be greater than 0"));

    const student = await Student.findOne({ _id: studentId, adminId });
    if (!student) return next(handleErrors(404, "Student not found"));

    const feeEntry = student.fee.find((f) => f.month === month.trim());
    if (!feeEntry) {
      return next(handleErrors(404, "Fee not generated for this month. Generate first."));
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
    feeEntry.collectedBy      = adminId;
    feeEntry.collectedByModel = "Admin";
    feeEntry.remarks          = remarks?.trim() || "";

    if (feeEntry.paidAmount >= feeEntry.monthlyFee && !feeEntry.receiptNo) {
      feeEntry.receiptNo = await generateReceiptNo(adminId.toString(), month);
    }

    await student.save();

    // ── Auto WhatsApp confirmation ────────────────────────
    const remaining      = Math.max(0, feeEntry.monthlyFee - feeEntry.paidAmount);
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
  } catch (err) {
    next(err);
  }
};

// ── GET /admin/fees/batch/:batchId ────────────────────────
export const getBatchFees = async (req, res, next) => {
  try {
    const { batchId } = req.params;
    const { month }   = req.query;
    const adminId     = req.admin._id;

    const batch = await Batch.findOne({ _id: batchId, adminId });
    if (!batch) return next(handleErrors(404, "Batch not found"));

    const students = await Student.find({ batchId, adminId, status: "active" })
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
        allFees:        !month ? s.fee : undefined,
      };
    });

    const summary = month ? {
      total:     data.length,
      paid:      data.filter((d) => d.feeEntry?.status === "paid").length,
      partial:   data.filter((d) => d.feeEntry?.status === "partial").length,
      pending:   data.filter((d) => !d.feeEntry || d.feeEntry?.status === "pending").length,
      collected: data.reduce((s, d) => s + (d.feeEntry?.paidAmount || 0), 0),
      due:       data.reduce((s, d) => s + Math.max(0, (d.feeEntry?.monthlyFee || 0) - (d.feeEntry?.paidAmount || 0)), 0),
    } : null;

    res.status(200).json({ success: true, batch, data, summary });
  } catch (err) {
    next(err);
  }
};

// ── GET /admin/fees/student/:studentId ────────────────────
export const getStudentFees = async (req, res, next) => {
  try {
    const student = await Student.findOne({
      _id:     req.params.studentId,
      adminId: req.admin._id,
    }).select("name phone batchName monthlyFee advanceBalance fee");
    if (!student) return next(handleErrors(404, "Student not found"));
    res.status(200).json({ success: true, student });
  } catch (err) {
    next(err);
  }
};

// ── GET /admin/fees/summary ───────────────────────────────
export const getFeeSummary = async (req, res, next) => {
  try {
    const adminId = req.admin._id;
    const { month } = req.query;

    const students = await Student.find({ adminId, status: "active" })
      .select("fee monthlyFee");

    let totalDue = 0, totalCollected = 0, paid = 0, partial = 0, pending = 0;

    students.forEach((s) => {
      const entry = month ? s.fee.find((f) => f.month === month.trim()) : null;
      if (month && entry) {
        totalDue       += entry.monthlyFee || 0;
        totalCollected += entry.paidAmount  || 0;
        if (entry.status === "paid")    paid++;
        if (entry.status === "partial") partial++;
        if (entry.status === "pending") pending++;
      }
    });

    res.status(200).json({
      success: true,
      summary: {
        month, totalStudents: students.length,
        totalDue, totalCollected,
        outstanding: totalDue - totalCollected,
        paid, partial, pending,
      },
    });
  } catch (err) {
    next(err);
  }
};