import { Router } from "express";
import { validate } from "@src/core/validation/validate";
import { idParam } from "@src/core/validation/common";
import { myNotifications, myUnreadCount, read } from "./announcements.controller";
import { notificationListQuery } from "./announcements.schemas";

const router = Router();
router.get("/me", validate({ query: notificationListQuery }), myNotifications);
router.get("/me/unread-count", myUnreadCount);
router.patch("/:id/read", validate({ params: idParam }), read);

export default router;
