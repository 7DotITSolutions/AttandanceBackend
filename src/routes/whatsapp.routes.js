// =============================================================
// FILE: src/routes/whatsapp.routes.js
// PURPOSE: WhatsApp routes. Admin + coach can access all.
// =============================================================

import express from "express";
import { authenticateBoth } from "../middleware/auth.both.js";
import {
  getReminderBatches,
  sendBatchFeeReminder,
  sendSingleFeeReminder,
  sendAllDefaultersReminder,
  notifyFeeCollected,
} from "../controllers/whatsapp.controller.js";

const waRouter = express.Router();
waRouter.use(authenticateBoth);

waRouter.get("/batches",                      getReminderBatches);
waRouter.post("/fee-reminder",                sendBatchFeeReminder);
waRouter.post("/fee-reminder-single",         sendSingleFeeReminder);        // ← NEW
waRouter.post("/fee-reminder-all-defaulters", sendAllDefaultersReminder);    // ← NEW
waRouter.post("/fee-collected",               notifyFeeCollected);

export default waRouter;