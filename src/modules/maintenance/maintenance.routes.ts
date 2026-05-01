import { Router } from "express";
import * as maintenanceController from "./maintenance.controller";
import { authenticate } from "../common/middlewares/auth.middleware";

const router = Router();

router.post("/", authenticate, maintenanceController.createMaintenance);
router.post("/datatable", maintenanceController.getDataTable);
router.get("/", authenticate, maintenanceController.getMaintenances);
router.get("/pending-count", authenticate, maintenanceController.getPendingCount);
router.put("/:id/resolve", authenticate, maintenanceController.resolveMaintenance);
router.delete("/:id", authenticate, maintenanceController.deleteMaintenance);
router.delete("/:id/media", authenticate, maintenanceController.deleteMedia);

export default router;
