import { Router } from "express";
import { validate } from "@src/core/validation/validate";
import { createIncidentBody } from "./incident.schemas";
import { requireRole } from "@src/modules/common/middlewares/role.middleware";
import * as incidentController from "./incident.controller";
import { authenticate } from "../common/middlewares/auth.middleware";

const router = Router();

router.post("/", authenticate, validate({ body: createIncidentBody }), incidentController.createIncident);
router.post("/datatable", incidentController.getDataTable);
router.get("/", authenticate, incidentController.getIncidents);
router.get("/pending-count", authenticate, incidentController.getPendingCount);
router.put("/:id/resolve", requireRole(["ADMIN", "SHIFT"]), authenticate, incidentController.resolveIncident);
router.delete("/:id", requireRole(["ADMIN", "SHIFT"]), authenticate, incidentController.deleteIncident);
router.delete("/:id/media", requireRole(["ADMIN", "SHIFT"]), authenticate, incidentController.deleteMedia);

export default router;
