import { Router } from "express";
import validationMiddleware from "@src/core/middlewares/token-validator.middleware";
import { getChangelog } from "./sync.controller";

const router = Router();

// Todas las rutas requieren token válido.
router.use(validationMiddleware);

/**
 * GET /sync/changelog?since=ISO
 * Devuelve los deltas (added/modified/removed) de rutas, ubicaciones,
 * asignaciones especiales y catálogos para el guardia autenticado.
 */
router.get("/changelog", getChangelog);

export default router;
