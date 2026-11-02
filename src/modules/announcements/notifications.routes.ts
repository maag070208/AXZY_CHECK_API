import { Router } from "express";
import { validate } from "@src/core/validation/validate";
import { requirePermission } from "@src/modules/common/middlewares/require-permission.middleware";
import { idParam } from "@src/core/validation/common";
import { myNotifications, myUnreadCount, read, registerDevice, sendNotification } from "./announcements.controller";
import { notificationListQuery, pushDeviceBody, sendNotificationBody } from "./announcements.schemas";

const router = Router();
router.post("/", requirePermission("announcement.manage"), validate({ body: sendNotificationBody }), sendNotification);
router.get("/me", validate({ query: notificationListQuery }), myNotifications);
router.get("/me/unread-count", myUnreadCount);
router.post("/devices", validate({ body: pushDeviceBody }), registerDevice);
router.patch("/:id/read", validate({ params: idParam }), read);

export default router;
