import { Router } from "express";
import { validate } from "@src/core/validation/validate";
import { routeBody, routeParams } from "./recurring.schemas";
import { createRecurring, deleteRecurring, getRecurringList, toggleRecurring, assignGuard, getMyRecurring, updateRecurring, getDataTable } from "./recurring.controller";
import { authenticate } from "@src/modules/common/middlewares/auth.middleware";
import { requireRole } from "@src/modules/common/middlewares/role.middleware";

const router = Router();

// Autenticación obligatoria en todas las rutas.
router.use(authenticate);

// Gestión de rutas: solo ADMIN y SHIFT (Jefe de Guardias).
const MANAGERS = ["ADMIN", "SHIFT"];
// Ejecución: cualquier personal operativo consulta SUS rutas.
const OPERATIONAL = ["ADMIN", "SHIFT", "GUARD", "MAINT"];

router.post("/datatable", requireRole(MANAGERS), getDataTable);
router.get("/", requireRole(MANAGERS), getRecurringList);
router.get("/my-list", requireRole(OPERATIONAL), getMyRecurring);
router.post("/", requireRole(MANAGERS), validate({ body: routeBody }), createRecurring);
router.post("/:id/assign", requireRole(MANAGERS), assignGuard);
router.put("/:id", requireRole(MANAGERS), validate({ params: routeParams, body: routeBody }), updateRecurring);
router.put("/:id/toggle", requireRole(MANAGERS), toggleRecurring);
router.delete("/:id", requireRole(MANAGERS), deleteRecurring);

export default router;
