import { Router } from "express";
import { requirePermission } from "@src/modules/common/middlewares/require-permission.middleware";
import * as clubController from "./club.controller";
import { authenticate } from "../common/middlewares/auth.middleware";
import { validate } from "@src/core/validation/validate";
import { createClubBody } from "./club.schemas";

const router = Router();

router.post("/", authenticate, requirePermission("club.create"), validate({ body: createClubBody }), clubController.createClub);
router.post("/datatable", requirePermission("club.view"), clubController.getDataTable);
router.get("/", authenticate, requirePermission("club.view"), clubController.getClubs);
router.get("/pending-count", authenticate, requirePermission("club.view"), clubController.getPendingCount);
router.put("/:id/resolve", authenticate, requirePermission("club.resolve"), clubController.resolveClub);
router.delete("/:id", authenticate, requirePermission("club.delete"), clubController.deleteClub);
router.delete("/:id/media", authenticate, requirePermission("club.delete"), clubController.deleteMedia);

export default router;
