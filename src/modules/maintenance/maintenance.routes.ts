import { Router } from "express";
import { requirePermission } from "@src/modules/common/middlewares/require-permission.middleware";
import * as maintenanceController from "./maintenance.controller";
import { authenticate } from "../common/middlewares/auth.middleware";
import maintenanceReportRouter from "./maintenance-report.routes";
import { validate } from "@src/core/validation/validate";
import { createMaintenanceBody } from "./maintenance.schemas";

const router = Router();

router.post("/", authenticate, validate({ body: createMaintenanceBody }), maintenanceController.createMaintenance);
router.post("/datatable", maintenanceController.getDataTable);
router.get("/", authenticate, maintenanceController.getMaintenances);
router.get("/pending-count", authenticate, maintenanceController.getPendingCount);
router.put("/:id/resolve", requirePermission("maintenance.manage"), authenticate, maintenanceController.resolveMaintenance);
router.delete("/:id", requirePermission("maintenance.manage"), authenticate, maintenanceController.deleteMaintenance);
router.delete("/:id/media", requirePermission("maintenance.manage"), authenticate, maintenanceController.deleteMedia);

router.use(maintenanceReportRouter);

export default router;
