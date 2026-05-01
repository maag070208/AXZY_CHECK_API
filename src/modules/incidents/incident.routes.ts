import { Router } from "express";
import * as incidentController from "./incident.controller";
import { authenticate } from "../common/middlewares/auth.middleware";

const router = Router();

router.post("/", authenticate, incidentController.createIncident);
router.post("/datatable", incidentController.getDataTable);
router.get("/", authenticate, incidentController.getIncidents);
router.get("/pending-count", authenticate, incidentController.getPendingCount);
router.put("/:id/resolve", authenticate, incidentController.resolveIncident);
router.delete("/:id", authenticate, incidentController.deleteIncident);
router.delete("/:id/media", authenticate, incidentController.deleteMedia);

export default router;
