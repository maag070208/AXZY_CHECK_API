import { Router } from "express";
import * as chatController from "./chat.controller";
import { authenticate } from "../common/middlewares/auth.middleware";
import { requireRole } from "../common/middlewares/role.middleware";
import { CHAT_ALLOWED_ROLES } from "./chat.service";

const router = Router();

router.use(authenticate, requireRole([...CHAT_ALLOWED_ROLES]));

router.get("/messages", chatController.getMessages);
router.post("/messages", chatController.createMessage);

export default router;
