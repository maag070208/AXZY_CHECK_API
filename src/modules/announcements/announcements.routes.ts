import { Router } from "express";
import { validate } from "@src/core/validation/validate";
import { requirePermission } from "@src/modules/common/middlewares/require-permission.middleware";
import { create, list } from "./announcements.controller";
import { announcementsQuery, createAnnouncementBody } from "./announcements.schemas";

const router = Router();
router.get("/", requirePermission("announcement.view"), validate({ query: announcementsQuery }), list);
router.post("/", requirePermission("announcement.manage"), validate({ body: createAnnouncementBody }), create);

export default router;
