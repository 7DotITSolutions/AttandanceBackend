// =============================================================
// FILE: src/routes/auth.routes.js
// PURPOSE: Public auth routes — universal login for all users,
//          coach first-login email verification.
//          Mount in server.js as: app.use("/auth", authRouter)
// =============================================================

import express from "express";
import {
  unifiedLogin,
  verifyCoachEmail,
} from "../controllers/auth/unified.auth.controller.js";

const authRouter = express.Router();

authRouter.post("/login",               unifiedLogin);
authRouter.post("/verify-coach-email",  verifyCoachEmail);

export default authRouter;