// =============================================================
// FILE: src/utils/sendEmail.js
// PURPOSE: Nodemailer wrapper for sending all system emails.
//          Handles OTP emails, credential emails, fee reminders.
//          Configure SMTP in .env. Uses Gmail by default.
//          All email templates live here for easy editing.
// =============================================================

import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

// ── Create reusable transporter ───────────────────────────
const transporter = nodemailer.createTransport({
  host:   process.env.EMAIL_HOST   || "smtp.gmail.com",
  port:   parseInt(process.env.EMAIL_PORT) || 587,
  secure: false, // true for port 465
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// ── Generic send function ─────────────────────────────────
const sendEmail = async ({ to, subject, html }) => {
  try {
    await transporter.sendMail({
      from: `"Attendance Pro" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html,
    });
  } catch (err) {
    console.error("Email send failed:", err.message);
    // Don't throw — email failure shouldn't crash the request
  }
};

// ── Template: Admin registration OTP ─────────────────────
export const sendAdminOtp = async (email, name, otp) => {
  await sendEmail({
    to: email,
    subject: "Verify your Attendance Pro account",
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto">
        <h2 style="color:#7c3aed">Attendance Pro</h2>
        <p>Hi <strong>${name}</strong>,</p>
        <p>Use the OTP below to verify your account. Valid for <strong>10 minutes</strong>.</p>
        <div style="font-size:2rem;font-weight:700;letter-spacing:0.3em;padding:1rem;background:#f5f3ff;border-radius:8px;text-align:center;color:#7c3aed">
          ${otp}
        </div>
        <p style="color:#888;font-size:0.85rem;margin-top:1rem">
          If you did not request this, ignore this email.
        </p>
      </div>
    `,
  });
};

// ── Template: Admin password reset OTP ───────────────────
export const sendPasswordResetOtp = async (email, name, otp) => {
  await sendEmail({
    to: email,
    subject: "Reset your Attendance Pro password",
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto">
        <h2 style="color:#7c3aed">Attendance Pro</h2>
        <p>Hi <strong>${name}</strong>,</p>
        <p>Your password reset OTP is below. Valid for <strong>10 minutes</strong>.</p>
        <div style="font-size:2rem;font-weight:700;letter-spacing:0.3em;padding:1rem;background:#fef3c7;border-radius:8px;text-align:center;color:#92400e">
          ${otp}
        </div>
      </div>
    `,
  });
};

// ── Template: Coach account credentials ──────────────────
export const sendCoachCredentials = async (email, name, password) => {
  await sendEmail({
    to: email,
    subject: "Your Attendance Pro coach account is ready",
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto">
        <h2 style="color:#0891b2">Attendance Pro</h2>
        <p>Hi <strong>${name}</strong>,</p>
        <p>Your coach account has been created. Use the credentials below to log in.</p>
        <table style="width:100%;border-collapse:collapse;margin:1rem 0">
          <tr>
            <td style="padding:0.5rem;background:#f0f9ff;border-radius:4px 0 0 4px;font-weight:600">Email</td>
            <td style="padding:0.5rem;background:#f0f9ff">${email}</td>
          </tr>
          <tr>
            <td style="padding:0.5rem;font-weight:600">Password</td>
            <td style="padding:0.5rem">${password}</td>
          </tr>
        </table>
        <p>You will be asked to verify your email on first login.</p>
        <p style="color:#888;font-size:0.85rem">
          Please change your password after logging in for security.
        </p>
      </div>
    `,
  });
};

// ── Template: Coach first-login OTP ──────────────────────
export const sendCoachVerificationOtp = async (email, name, otp) => {
  await sendEmail({
    to: email,
    subject: "Verify your Attendance Pro coach account",
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto">
        <h2 style="color:#0891b2">Attendance Pro</h2>
        <p>Hi <strong>${name}</strong>,</p>
        <p>Enter this OTP to verify your email and access your dashboard. Valid for <strong>10 minutes</strong>.</p>
        <div style="font-size:2rem;font-weight:700;letter-spacing:0.3em;padding:1rem;background:#ecfeff;border-radius:8px;text-align:center;color:#0891b2">
          ${otp}
        </div>
        <p style="color:#888;font-size:0.85rem;margin-top:1rem">
          After this, you can log in directly with your email and password.
        </p>
      </div>
    `,
  });
};

// ── Template: Fee reminder ────────────────────────────────
export const sendFeeReminder = async (email, studentName, month, amount) => {
  await sendEmail({
    to: email,
    subject: `Fee reminder — ${month}`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto">
        <h2 style="color:#dc2626">Attendance Pro</h2>
        <p>Dear Parent/Guardian,</p>
        <p>This is a reminder that the fee for <strong>${studentName}</strong> for <strong>${month}</strong> 
           of <strong>₹${amount}</strong> is pending.</p>
        <p>Please contact the institute to clear the dues.</p>
      </div>
    `,
  });
};

export default sendEmail;