import { Router } from "express";
import { validate } from "@src/core/validation/validate";
import { createIncidentBody } from "./incident.schemas";
import { requirePermission } from "@src/modules/common/middlewares/require-permission.middleware";
import * as incidentController from "./incident.controller";
import { authenticate } from "../common/middlewares/auth.middleware";

const router = Router();

router.post("/", authenticate, validate({ body: createIncidentBody }), incidentController.createIncident);
router.post("/datatable", incidentController.getDataTable);
router.get("/", authenticate, incidentController.getIncidents);
router.get("/pending-count", authenticate, incidentController.getPendingCount);
router.put("/:id/resolve", requirePermission("incidents.manage"), authenticate, incidentController.resolveIncident);
router.delete("/:id", requirePermission("incidents.manage"), authenticate, incidentController.deleteIncident);
router.delete("/:id/media", requirePermission("incidents.manage"), authenticate, incidentController.deleteMedia);

export default router;
