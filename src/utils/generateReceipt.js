// =============================================================
// FILE: src/utils/generateReceipt.js
// PURPOSE: Generates unique receipt numbers for fee payments.
//          Format: RCP-YYYYMM-XXXX  e.g. RCP-202501-0042
//          Looks at existing receipts for the same admin+month
//          and increments. Thread-safe enough for single-server.
// =============================================================

import Student from "../models/student.model.js";

/**
 * Generate next receipt number for a given admin and month.
 * @param {string} adminId  - Admin's MongoDB ObjectId string
 * @param {string} month    - e.g. "January 2025"
 * @returns {string}        - e.g. "RCP-202501-0042"
 */
const generateReceiptNo = async (adminId, month) => {
  // Convert "January 2025" → "202501"
  const date = new Date(`${month} 01`);
  const year  = date.getFullYear();
  const mon   = String(date.getMonth() + 1).padStart(2, "0");
  const prefix = `RCP-${year}${mon}`;

  // Find the highest sequence for this admin + month prefix
  const students = await Student.find({
    adminId,
    "fee.receiptNo": { $regex: `^${prefix}` },
  }).select("fee.receiptNo");

  let maxSeq = 0;
  students.forEach((s) => {
    s.fee.forEach((f) => {
      if (f.receiptNo && f.receiptNo.startsWith(prefix)) {
        const seq = parseInt(f.receiptNo.split("-")[2] || "0", 10);
        if (seq > maxSeq) maxSeq = seq;
      }
    });
  });

  const nextSeq = String(maxSeq + 1).padStart(4, "0");
  return `${prefix}-${nextSeq}`;
};

export default generateReceiptNo;