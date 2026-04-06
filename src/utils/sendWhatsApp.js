// =============================================================
// FILE: src/utils/sendWhatsApp.js
// PURPOSE: WhatsApp fee reminders via Twilio WhatsApp API.
//          Better than email for India — parents read WhatsApp.
//          Development: use Twilio Sandbox (free).
//          Production: upgrade to Meta WhatsApp Business API.
//
// SETUP:
//   1. npm install twilio
//   2. Sign up at twilio.com (free trial available)
//   3. Enable WhatsApp Sandbox in Twilio Console
//   4. Add to .env:
//        TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
//        TWILIO_AUTH_TOKEN=your_auth_token
//        TWILIO_WHATSAPP_FROM=whatsapp:+14155238886  (sandbox number)
//
// USAGE:
//   import { sendFeeReminderWhatsApp } from "./sendWhatsApp.js";
//   await sendFeeReminderWhatsApp("+919876543210", "Rahul", "January 2025", 1500);
// =============================================================

let twilioClient = null;

const getTwilioClient = () => {
  if (twilioClient) return twilioClient;
  try {
    // Lazy import so app doesn't crash if twilio not installed
    const twilio = require("twilio");
    twilioClient = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );
    return twilioClient;
  } catch {
    console.warn("Twilio not installed. Run: npm install twilio");
    return null;
  }
};

// ── Fee reminder via WhatsApp ─────────────────────────────
export const sendFeeReminderWhatsApp = async (phone, studentName, month, amount) => {
  // Normalize phone number to international format
  // Assumes India (+91) if no country code
  let normalized = phone.replace(/\s+/g, "").replace(/[^0-9+]/g, "");
  if (!normalized.startsWith("+")) {
    normalized = "+91" + normalized.replace(/^0/, "");
  }

  const message =
    `📚 *Attendance Pro Fee Reminder*\n\n` +
    `Dear Parent,\n` +
    `This is a reminder that the fee for *${studentName}* for *${month}* ` +
    `of *₹${amount}* is pending.\n\n` +
    `Please contact the institute to clear the dues.\n\n` +
    `Thank you 🙏`;

  const client = getTwilioClient();
  if (!client) {
    console.log(`[DEV WhatsApp] To: ${normalized}\n${message}`);
    return;
  }

  try {
    await client.messages.create({
      from: process.env.TWILIO_WHATSAPP_FROM || "whatsapp:+14155238886",
      to:   `whatsapp:${normalized}`,
      body: message,
    });
    console.log(`WhatsApp sent to ${normalized}`);
  } catch (err) {
    console.error("WhatsApp send failed:", err.message);
    // Don't throw — reminder failure shouldn't crash the request
  }
};

// ── Attendance alert via WhatsApp ─────────────────────────
export const sendLowAttendanceAlert = async (phone, studentName, percentage) => {
  let normalized = phone.replace(/\s+/g, "").replace(/[^0-9+]/g, "");
  if (!normalized.startsWith("+")) {
    normalized = "+91" + normalized.replace(/^0/, "");
  }

  const message =
    `⚠️ *Attendance Alert — Attendance Pro*\n\n` +
    `Dear Parent,\n` +
    `*${studentName}*'s attendance has dropped to *${percentage}%*.\n\n` +
    `Regular attendance is important for progress. ` +
    `Please ensure your child attends classes regularly.\n\n` +
    `Thank you 🙏`;

  const client = getTwilioClient();
  if (!client) {
    console.log(`[DEV WhatsApp] To: ${normalized}\n${message}`);
    return;
  }

  try {
    await client.messages.create({
      from: process.env.TWILIO_WHATSAPP_FROM || "whatsapp:+14155238886",
      to:   `whatsapp:${normalized}`,
      body: message,
    });
  } catch (err) {
    console.error("WhatsApp alert failed:", err.message);
  }
};