import { Router } from "express";
import { requireRole } from "@src/modules/common/middlewares/role.middleware";
import * as clubController from "./club.controller";
import { authenticate } from "../common/middlewares/auth.middleware";

const router = Router();

router.post("/", authenticate, clubController.createClub);
router.post("/datatable", clubController.getDataTable);
router.get("/", authenticate, clubController.getClubs);
router.get("/pending-count", authenticate, clubController.getPendingCount);
router.put("/:id/resolve", requireRole(["ADMIN", "SHIFT"]), authenticate, clubController.resolveClub);
router.delete("/:id", requireRole(["ADMIN", "SHIFT"]), authenticate, clubController.deleteClub);
router.delete("/:id/media", requireRole(["ADMIN", "SHIFT"]), authenticate, clubController.deleteMedia);

export default router;
