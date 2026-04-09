// =============================================================
// FILE: src/utils/sendWhatsApp.js
// PURPOSE: WhatsApp messaging via Twilio WhatsApp API.
//          Used for:
//          1. Monthly fee reminder (manual trigger from sidebar)
//          2. Auto-message when fee is collected
//          3. Monthly attendance summary (sent with fee reminder)
//
// SETUP:
//   npm install twilio
//   Add to .env:
//     TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
//     TWILIO_AUTH_TOKEN=your_auth_token
//     TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
//     INSTITUTION_NAME=Your Institute Name
// =============================================================

import dotenv from "dotenv";
dotenv.config();

// ── Lazy Twilio init (won't crash if not installed) ────────
let client = null;

const getTwilio = async () => {
  if (client) return client;

  try {
    const twilio = (await import("twilio")).default;

    client = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );

    return client;
  } catch {
    return null;
  }
};

// ── Normalize Indian phone number ──────────────────────────
const normalizePhone = (phone) => {
  let p = phone?.toString().replace(/\D/g, "") || "";
  if (p.startsWith("91") && p.length === 12) return `+${p}`;
  if (p.length === 10) return `+91${p}`;
  if (p.startsWith("+")) return phone.replace(/[^\d+]/g, "");
  return `+91${p}`;
};

// ── Core send function ─────────────────────────────────────
const sendWA = async (to, message) => {
  const normalized = normalizePhone(to);
  const from       = process.env.TWILIO_WHATSAPP_FROM || "whatsapp:+14155238886";
  const institution = process.env.INSTITUTION_NAME   || "AttendancePro";

  // Dev mode — just log
  if (!process.env.TWILIO_ACCOUNT_SID || process.env.NODE_ENV === "development") {
    console.log(`[WhatsApp DEV] To: ${normalized}\n${message}\n`);
    return { success: true, dev: true };
  }

  try {
    const twilio = await getTwilio();
    if (!twilio) {
      console.warn("[WhatsApp] Twilio not configured. Install: npm install twilio");
      return { success: false, error: "Twilio not configured" };
    }
    await twilio.messages.create({
      from,
      to:   `whatsapp:${normalized}`,
      body: message,
    });
    return { success: true };
  } catch (err) {
    console.error(`[WhatsApp] Send failed to ${normalized}:`, err.message);
    return { success: false, error: err.message };
  }
};

// ── Template 1: Monthly fee reminder ─────────────────────
// Sent at start of month with last month's attendance summary
export const sendFeeReminder = async ({
  phone,
  studentName,
  fatherName,
  currentMonth,
  monthlyFee,
  lastMonthName,
  present,
  absent,
  leave,
  total,
  percentage,
  institutionName,
}) => {
  const inst = institutionName || process.env.INSTITUTION_NAME || "Your Institute";
  const message =
    `📚 *${inst}*\n\n` +
    `Dear Parent of *${studentName}*,\n\n` +
    `🗓️ *${currentMonth} Fee Reminder*\n` +
    `Monthly Fee: *₹${monthlyFee}*\n` +
    `Please pay your fees at the earliest.\n\n` +
    `📊 *${lastMonthName} Attendance*\n` +
    `✅ Present: ${present} days\n` +
    `❌ Absent:  ${absent} days\n` +
    `🏖️ Leave:   ${leave} days\n` +
    `📈 Total:   ${total} days (${percentage}%)\n\n` +
    `_For queries contact the institute._\n` +
    `_Please do not reply to this message._`;

  return sendWA(phone, message);
};

// ── Template 2: Fee collected confirmation ────────────────
// Sent automatically when admin/coach collects a fee
export const sendFeeCollectedMsg = async ({
  phone,
  studentName,
  month,
  amountPaid,
  receiptNo,
  remainingBalance,
  institutionName,
}) => {
  const inst = institutionName || process.env.INSTITUTION_NAME || "Your Institute";
  let message =
    `✅ *${inst}*\n\n` +
    `Dear Parent of *${studentName}*,\n\n` +
    `💰 *Fee Payment Received*\n` +
    `Month:   ${month}\n` +
    `Amount:  *₹${amountPaid}*\n`;

  if (receiptNo) {
    message += `Receipt: ${receiptNo}\n`;
  }
  if (remainingBalance > 0) {
    message += `\n⚠️ Remaining balance: *₹${remainingBalance}*\n`;
  } else {
    message += `\n🎉 Fees fully paid for ${month}!\n`;
  }

  message += `\n_Thank you for the payment._`;

  return sendWA(phone, message);
};

// ── Template 3: Low attendance alert ─────────────────────
export const sendLowAttendanceAlert = async ({
  phone,
  studentName,
  percentage,
  month,
  institutionName,
}) => {
  const inst = institutionName || process.env.INSTITUTION_NAME || "Your Institute";
  const message =
    `⚠️ *${inst} — Attendance Alert*\n\n` +
    `Dear Parent of *${studentName}*,\n\n` +
    `Your child's attendance in *${month}* is *${percentage}%*.\n\n` +
    `Regular attendance is important for progress. Please ensure your child attends classes regularly.\n\n` +
    `_For queries contact the institute._`;

  return sendWA(phone, message);
};
export default sendWA;