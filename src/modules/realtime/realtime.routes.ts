import { Router } from "express";
import * as realtimeController from "./realtime.controller";
import { authenticate } from "../common/middlewares/auth.middleware";

const router = Router();

router.get("/token", authenticate, realtimeController.getRealtimeToken);

export default router;
