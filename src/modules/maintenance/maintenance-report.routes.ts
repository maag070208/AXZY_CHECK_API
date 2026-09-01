import { Router } from "express";
import { authenticate } from "../common/middlewares/auth.middleware";
import { getMaintenancesPdf } from "./maintenance-report.controller";

/**
 * @description Rutas para el reporte PDF de mantenimientos. Se monta en el
 * router principal bajo `/maintenance` (la ruta efectiva es
 * `GET /maintenance/report/pdf`).
 */
const router = Router();

router.get("/report/pdf", authenticate, getMaintenancesPdf);

export default router;
