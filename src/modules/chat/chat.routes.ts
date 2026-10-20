import { Router } from "express";
import * as chatController from "./chat.controller";
import { authenticate } from "../common/middlewares/auth.middleware";
import { requirePermission } from "../common/middlewares/require-permission.middleware";
import { validate } from "@src/core/validation/validate";
import { createMessageBody } from "./chat.schemas";

const router = Router();

router.use(authenticate, requirePermission("chat.use"));

router.get("/messages", chatController.getMessages);
router.post("/messages", validate({ body: createMessageBody }), chatController.createMessage);

export default router;
