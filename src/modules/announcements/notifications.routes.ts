import { Router } from "express";
import { validate } from "@src/core/validation/validate";
import { idParam } from "@src/core/validation/common";
import { myNotifications, myUnreadCount, read, registerDevice } from "./announcements.controller";
import { notificationListQuery, pushDeviceBody } from "./announcements.schemas";

const router = Router();
router.get("/me", validate({ query: notificationListQuery }), myNotifications);
router.get("/me/unread-count", myUnreadCount);
router.post("/devices", validate({ body: pushDeviceBody }), registerDevice);
router.patch("/:id/read", validate({ params: idParam }), read);

export default router;
