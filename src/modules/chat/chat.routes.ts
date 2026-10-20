import { Router } from "express";
import * as chatController from "./chat.controller";
import { authenticate } from "../common/middlewares/auth.middleware";
import { requirePermission } from "../common/middlewares/require-permission.middleware";

const router = Router();

router.use(authenticate, requirePermission("chat.use"));

router.get("/messages", chatController.getMessages);
router.post("/messages", chatController.createMessage);

export default router;
