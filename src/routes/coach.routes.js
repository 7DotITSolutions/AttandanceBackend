// =============================================================
// FILE: src/routes/coach.routes.js
// PURPOSE: All coach-protected routes. Every route requires
//          authenticateCoach middleware. Coach can only access
//          their own batches and students — enforced in
//          controllers via coachId scope check.
//          Mount in server.js as: app.use("/coach", coachRouter)
// =============================================================

import express from "express";
import { authenticateCoach } from "../middleware/auth.coach.js";

import { getCoachDashboard } from "../controllers/coach/coach.controller.js";
import {
  coachMarkAttendance,
  coachGetBatchAttendance,
} from "../controllers/coach/coach.controller.js";
import {
  coachCollectFee,
  coachGetBatchFees,
} from "../controllers/coach/coach.controller.js";

const coachRouter = express.Router();

// All coach routes require auth
coachRouter.use(authenticateCoach);

// Dashboard
coachRouter.get("/dashboard",                         getCoachDashboard);

// Attendance
coachRouter.post("/attendance/mark",                  coachMarkAttendance);
coachRouter.get("/attendance/batch/:batchId",         coachGetBatchAttendance);

// Fees
coachRouter.post("/fees/collect",                     coachCollectFee);
coachRouter.get("/fees/batch/:batchId",               coachGetBatchFees);

export default coachRouter;