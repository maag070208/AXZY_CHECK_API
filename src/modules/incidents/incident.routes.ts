import { Router } from "express";
import { validate } from "@src/core/validation/validate";
import { createIncidentBody } from "./incident.schemas";
import { requirePermission } from "@src/modules/common/middlewares/require-permission.middleware";
import * as incidentController from "./incident.controller";
import { authenticate } from "../common/middlewares/auth.middleware";

const router = Router();

router.post("/", authenticate, requirePermission("incident.create"), validate({ body: createIncidentBody }), incidentController.createIncident);
router.post("/datatable", requirePermission("incident.view"), incidentController.getDataTable);
router.get("/", authenticate, requirePermission("incident.view"), incidentController.getIncidents);
router.get("/pending-count", authenticate, requirePermission("incident.view"), incidentController.getPendingCount);
router.put("/:id/resolve", authenticate, requirePermission("incident.resolve"), incidentController.resolveIncident);
router.delete("/:id", authenticate, requirePermission("incident.delete"), incidentController.deleteIncident);
router.delete("/:id/media", authenticate, requirePermission("incident.delete"), incidentController.deleteMedia);

export default router;
