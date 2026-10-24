import { Router } from "express";
import { requirePermission } from "@src/modules/common/middlewares/require-permission.middleware";
import * as maintenanceController from "./maintenance.controller";
import { authenticate } from "../common/middlewares/auth.middleware";
import maintenanceReportRouter from "./maintenance-report.routes";
import { validate } from "@src/core/validation/validate";
import { createMaintenanceBody } from "./maintenance.schemas";

const router = Router();

router.post("/", authenticate, requirePermission("maintenance.create"), validate({ body: createMaintenanceBody }), maintenanceController.createMaintenance);
router.post("/datatable", requirePermission("maintenance.view"), maintenanceController.getDataTable);
router.get("/", authenticate, requirePermission("maintenance.view"), maintenanceController.getMaintenances);
router.get("/pending-count", authenticate, requirePermission("maintenance.view"), maintenanceController.getPendingCount);
router.put("/:id/resolve", authenticate, requirePermission("maintenance.resolve"), maintenanceController.resolveMaintenance);
router.delete("/:id", authenticate, requirePermission("maintenance.delete"), maintenanceController.deleteMaintenance);
router.delete("/:id/media", authenticate, requirePermission("maintenance.delete"), maintenanceController.deleteMedia);

router.use(maintenanceReportRouter);

export default router;
