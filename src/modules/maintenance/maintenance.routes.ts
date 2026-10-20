import { Router } from "express";
import { requireRole } from "@src/modules/common/middlewares/role.middleware";
import * as maintenanceController from "./maintenance.controller";
import { authenticate } from "../common/middlewares/auth.middleware";
import maintenanceReportRouter from "./maintenance-report.routes";

const router = Router();

router.post("/", authenticate, maintenanceController.createMaintenance);
router.post("/datatable", maintenanceController.getDataTable);
router.get("/", authenticate, maintenanceController.getMaintenances);
router.get("/pending-count", authenticate, maintenanceController.getPendingCount);
router.put("/:id/resolve", requireRole(["ADMIN", "MAINT"]), authenticate, maintenanceController.resolveMaintenance);
router.delete("/:id", requireRole(["ADMIN", "MAINT"]), authenticate, maintenanceController.deleteMaintenance);
router.delete("/:id/media", requireRole(["ADMIN", "MAINT"]), authenticate, maintenanceController.deleteMedia);

router.use(maintenanceReportRouter);

export default router;
