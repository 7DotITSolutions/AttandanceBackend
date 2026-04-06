// =============================================================
// FILE: src/routes/coach.routes.js
// PURPOSE: All coach-protected routes. Every route requires
//          authenticateCoach middleware. Coach can only access
//          their own batches and students — enforced in
//          controllers via coachId scope check.
//          Mount in server.js as: app.use("/coach", coachRouter)
// =============================================================

// =============================================================
// FILE: src/routes/coach.routes.js
// PURPOSE: All coach-protected routes.
// FIX: Added student routes so coach can view students in
//      their assigned batches without hitting admin endpoints.
//      GET /coach/batch/:batchId/students — students in one batch
//      GET /coach/student/:studentId      — single student detail
// =============================================================
// =============================================================
// FILE: src/routes/coach.routes.js
// PURPOSE: All coach-protected routes.
//          Includes full student CRUD and bulk import so coach
//          can manage students in their assigned batches.
// =============================================================

import express from "express";
import { authenticateCoach } from "../middleware/auth.coach.js";
import upload from "../middleware/upload.js";

// Coach core controllers
import {
  getCoachDashboard,
  coachMarkAttendance,
  coachGetBatchAttendance,
  coachCollectFee,
  coachGetBatchFees,
} from "../controllers/coach/coach.controller.js";

// Coach student controllers
import {
  coachGetBatchStudents,
  coachGetStudentById,
  coachCreateStudent,
  coachUpdateStudent,
  coachDeleteStudent,
  coachBulkCreateStudents,
} from "../controllers/coach/student.controller.js";

const coachRouter = express.Router();

// All coach routes require authentication
coachRouter.use(authenticateCoach);

// ── Dashboard ─────────────────────────────────────────────
coachRouter.get("/dashboard", getCoachDashboard);

// ── Student management (coach-scoped) ─────────────────────
// List students in a batch
coachRouter.get(
  "/batch/:batchId/students",
  coachGetBatchStudents
);

// Add single student to batch (with optional profile image)
coachRouter.post(
  "/batch/:batchId/students",
  upload.fields([{ name: "profile", maxCount: 1 }]),
  coachCreateStudent
);

// Bulk import students from Excel (array from frontend)
coachRouter.post(
  "/batch/:batchId/students/bulk",
  coachBulkCreateStudents
);

// Get single student detail
coachRouter.get(
  "/student/:studentId",
  coachGetStudentById
);

// Update student
coachRouter.put(
  "/student/:studentId",
  upload.fields([{ name: "profile", maxCount: 1 }]),
  coachUpdateStudent
);

// Delete student
coachRouter.delete(
  "/student/:studentId",
  coachDeleteStudent
);

// ── Attendance ────────────────────────────────────────────
coachRouter.post("/attendance/mark",          coachMarkAttendance);
coachRouter.get("/attendance/batch/:batchId", coachGetBatchAttendance);

// ── Fees ──────────────────────────────────────────────────
coachRouter.post("/fees/collect",         coachCollectFee);
coachRouter.get("/fees/batch/:batchId",   coachGetBatchFees);

export default coachRouter;