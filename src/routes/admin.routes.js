// =============================================================
// FILE: src/routes/admin.routes.js
// PURPOSE: All admin-protected routes. Every route after the
//          auth section requires authenticateAdmin middleware.
//          Covers: auth, batches, coaches, students,
//          attendance, fees, reports.
//          Mount in server.js as: app.use("/admin", adminRouter)
// =============================================================

import express from "express";
import { authenticateAdmin } from "../middleware/auth.admin.js";
import upload from "../middleware/upload.js";

// Auth
import {
  register, verifyEmail, logout,
  getProfile, updateProfile,
  sendOtp, resetPassword,
} from "../controllers/admin/auth.controller.js";

// Batch
import {
  createBatch, getBatches, getBatchById,
  updateBatch, assignCoach, deleteBatch,
} from "../controllers/admin/batch.controller.js";

// Coach
import {
  createCoach, getCoaches, getCoachById,
  updateCoachStatus, deleteCoach,
} from "../controllers/admin/coach.controller.js";

// Student
import {
  createStudent, getStudents, getStudentById,
  updateStudent, deleteStudent, bulkCreateStudents,
} from "../controllers/admin/student.controller.js";

// Attendance
import {
  markAttendance, getBatchAttendance, getStudentAttendance,
} from "../controllers/admin/attendance.controller.js";

// Fees
import {
  generateFees, collectFee, getBatchFees,
  getStudentFees, getFeeSummary,
} from "../controllers/admin/fees.controller.js";

// Reports
import {
  attendanceReport, feeReport,
  defaultersList, exportReport,
} from "../controllers/admin/reports.controller.js";

const adminRouter = express.Router();

// ── Public (no auth) ──────────────────────────────────────
adminRouter.post("/register",           register);
adminRouter.post("/verify-email",       verifyEmail);
adminRouter.post("/otp-send-password",  sendOtp);
adminRouter.post("/password-reset",     resetPassword);

// ── Protected (auth required below this line) ─────────────
adminRouter.use(authenticateAdmin);

// Auth
adminRouter.post("/logout",                   logout);
adminRouter.get("/profile",                   getProfile);
adminRouter.post("/profile/update",           upload.single("profile"), updateProfile);

// Batch
adminRouter.post("/batch/create",             createBatch);
adminRouter.get("/batch",                     getBatches);
adminRouter.get("/batch/:id",                 getBatchById);
adminRouter.put("/batch/:id",                 updateBatch);
adminRouter.post("/batch/:id/assign-coach",   assignCoach);
adminRouter.delete("/batch/:id",              deleteBatch);

// Coach
adminRouter.post("/coach/create",             createCoach);
adminRouter.get("/coach",                     getCoaches);
adminRouter.get("/coach/:id",                 getCoachById);
adminRouter.put("/coach/:id/status",          updateCoachStatus);
adminRouter.delete("/coach/:id",              deleteCoach);

// Student
adminRouter.post("/student/create",
  upload.fields([
    { name: "profile",         maxCount: 1 },
    { name: "aadharCardImage", maxCount: 1 },
  ]),
  createStudent
);
adminRouter.get("/student",                   getStudents);
adminRouter.get("/student/:id",               getStudentById);
adminRouter.put("/student/:id",
  upload.fields([
    { name: "profile",         maxCount: 1 },
    { name: "aadharCardImage", maxCount: 1 },
  ]),
  updateStudent
);
adminRouter.delete("/student/:id",            deleteStudent);
adminRouter.post("/student/bulk",             bulkCreateStudents);

// Attendance
adminRouter.post("/attendance/mark",                      markAttendance);
adminRouter.get("/attendance/batch/:batchId",             getBatchAttendance);
adminRouter.get("/attendance/student/:studentId",         getStudentAttendance);

// Fees
adminRouter.post("/fees/generate",            generateFees);
adminRouter.post("/fees/collect",             collectFee);
adminRouter.get("/fees/summary",              getFeeSummary);
adminRouter.get("/fees/batch/:batchId",       getBatchFees);
adminRouter.get("/fees/student/:studentId",   getStudentFees);

// Reports
adminRouter.get("/reports/attendance",        attendanceReport);
adminRouter.get("/reports/fees",              feeReport);
adminRouter.get("/reports/defaulters",        defaultersList);
adminRouter.get("/reports/export",            exportReport);

export default adminRouter;