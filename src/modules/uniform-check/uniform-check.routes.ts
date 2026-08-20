import { Router } from "express";
import * as uniformCheckController from "./uniform-check.controller";
import { authenticate } from "../common/middlewares/auth.middleware";
import { requireRole } from "@src/core/middlewares/require-role.middleware";

const router = Router();

router.use(authenticate);

// Catálogo de ítems (: para que la UI renderice el checklist.
router.get(
    "/items/catalog",
    requireRole("ADMIN", "SHIFT"),
    uniformCheckController.getItemsCatalog);

// Datatable.
router.post("/datatable", requireRole("ADMIN", "SHIFT"), uniformCheckController.getDataTable);

// Listado simple.
router.get("/", requireRole("ADMIN", "SHIFT"), uniformCheckController.listUniformChecks);

// Histórico por elemento (perfiles).
router.get(
    "/history/user/:userId",
    requireRole("ADMIN", "SHIFT"),
    uniformCheckController.listHistoryByUser);

// Crear (: aplicable a cualquier guardia en cualquier momento.
router.post("/", requireRole("ADMIN", "SHIFT"), uniformCheckController.createUniformCheck);

// Detalle.
router.get(
    "/:id",
    requireRole("ADMIN", "SHIFT"),
    uniformCheckController.getUniformCheck);

export default router;