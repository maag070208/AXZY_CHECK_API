import { Router } from "express";
import { requirePermission } from "@src/modules/common/middlewares/require-permission.middleware";
import * as clubController from "./club.controller";
import { authenticate } from "../common/middlewares/auth.middleware";
import { validate } from "@src/core/validation/validate";
import { createClubBody } from "./club.schemas";

const router = Router();

router.post("/", authenticate, validate({ body: createClubBody }), clubController.createClub);
router.post("/datatable", clubController.getDataTable);
router.get("/", authenticate, clubController.getClubs);
router.get("/pending-count", authenticate, clubController.getPendingCount);
router.put("/:id/resolve", requirePermission("club.manage"), authenticate, clubController.resolveClub);
router.delete("/:id", requirePermission("club.manage"), authenticate, clubController.deleteClub);
router.delete("/:id/media", requirePermission("club.manage"), authenticate, clubController.deleteMedia);

export default router;
