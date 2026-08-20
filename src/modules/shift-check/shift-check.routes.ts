import { Router } from "express";
import * as shiftCheckController from "./shift-check.controller";
import { authenticate } from "../common/middlewares/auth.middleware";
import { requireRole } from "@src/core/middlewares/require-role.middleware";

const router = Router();

router.use(authenticate);

// Datatable (): accesible para ADMIN y SHIFT.
router.post("/datatable", requireRole("ADMIN", "SHIFT"), shiftCheckController.getDataTable);

// Listado simple.
router.get("/", requireRole("ADMIN", "SHIFT"), shiftCheckController.listShiftChecks);

// Overview del día (dashboards).
router.get("/overview/day", requireRole("ADMIN", "SHIFT"), shiftCheckController.getDayOverview);

// Histórico por elemento.
router.get(
    "/history/user/:userId",
    requireRole("ADMIN", "SHIFT"),
    shiftCheckController.listHistoryByUser,
);

// Crear.
router.post("/", requireRole("ADMIN", "SHIFT"), shiftCheckController.createShiftCheck);

// Detalle.
router.get("/:id", requireRole("ADMIN", "SHIFT"), shiftCheckController.getShiftCheck);

// Editar (solo si no está firmado).
router.put("/:id", requireRole("ADMIN", "SHIFT"), shiftCheckController.updateShiftCheck);

// Firmar (Opción A).
router.post("/:id/sign", requireRole("ADMIN", "SHIFT"), shiftCheckController.signShiftCheck);

export default router;
