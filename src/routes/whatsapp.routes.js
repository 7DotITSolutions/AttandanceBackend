// =============================================================
// FILE: src/routes/whatsapp.routes.js
// PURPOSE: WhatsApp reminder routes. Both admin and coach can
//          access these via authenticateBoth middleware.
//          Mount in server.js as: app.use("/whatsapp", waRouter)
// =============================================================

import express from "express";
import { authenticateBoth } from "../middleware/auth.both.js";
import {
  sendBatchFeeReminder,
  notifyFeeCollected,
  getReminderBatches,
} from "../controllers/whatsapp.controller.js";

const waRouter = express.Router();

waRouter.use(authenticateBoth);

// Get batches for dropdown in sidebar
waRouter.get("/batches", getReminderBatches);

// Manual fee reminder for a batch
waRouter.post("/fee-reminder", sendBatchFeeReminder);

// Auto fee collected notification
waRouter.post("/fee-collected", notifyFeeCollected);

export default waRouter;