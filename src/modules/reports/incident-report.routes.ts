import { Router } from "express";
import { getClubPdf, getIncidentsPdf } from "./incident-report.controller";
import authenticate from "../../core/middlewares/token-validator.middleware";

/**
 * @description Rutas para la generación de reportes PDF.
 * Mantiene la convención del módulo reports: autenticación obligatoria
 * y respuestas en TResult cuando aplique.
 */
const router = Router();

router.use(authenticate);

/**
 * GET /reports/incidents/pdf
 * @description Genera un PDF con el detalle de las incidencias filtradas por
 * rango de fecha y, opcionalmente, por IDs específicos seleccionados.
 * @queryParam {string} startDate - Fecha inicio (ISO 8601).
 * @queryParam {string} endDate - Fecha fin (ISO 8601).
 * @queryParam {string} [ids] - IDs separados por coma.
 * @response 200 - application/pdf (binario)
 * @response 400 - Validación
 * @response 500 - Error inesperado
 */
router.get("/incidents/pdf", getIncidentsPdf);

/**
 * GET /reports/club/pdf
 * @description Genera un PDF con el detalle de los reportes de casa club
 * filtrados por rango de fecha y, opcionalmente, por IDs específicos.
 * @queryParam {string} startDate - Fecha inicio (ISO 8601).
 * @queryParam {string} endDate - Fecha fin (ISO 8601).
 * @queryParam {string} [ids] - IDs separados por coma.
 * @response 200 - application/pdf (binario)
 * @response 400 - Validación
 * @response 500 - Error inesperado
 */
router.get("/club/pdf", getClubPdf);

export default router;
