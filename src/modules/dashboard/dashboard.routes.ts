import { Router } from "express";
import * as dashboardController from "./dashboard.controller";
import { authenticate } from "../common/middlewares/auth.middleware";
import { requireRole } from "../common/middlewares/role.middleware";

const router = Router();

// El dashboard en vivo del Home de WEB es solo para quienes supervisan
// guardias día a día: ADMIN y SHIFT (Jefe de Guardias).
router.use(authenticate, requireRole(["ADMIN", "SHIFT"]));

router.get("/live", dashboardController.getLive);

export default router;
