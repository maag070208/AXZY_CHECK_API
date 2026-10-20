import { Router } from "express";
import { validate } from "@src/core/validation/validate";
import { idParam } from "@src/core/validation/common";
import { routeBody, routeParams, assignGuardBody, toggleRecurringBody } from "./recurring.schemas";
import { createRecurring, deleteRecurring, getRecurringList, toggleRecurring, assignGuard, getMyRecurring, updateRecurring, getDataTable } from "./recurring.controller";
import { authenticate } from "@src/modules/common/middlewares/auth.middleware";
import { requirePermission } from "@src/modules/common/middlewares/require-permission.middleware";

const router = Router();

// Autenticación obligatoria en todas las rutas.
router.use(authenticate);

// Gestión de rutas: solo ADMIN y SHIFT (Jefe de Guardias).
// Ejecución: cualquier personal operativo consulta SUS rutas.

router.post("/datatable", requirePermission("recurring.manage"), getDataTable);
router.get("/", requirePermission("recurring.manage"), getRecurringList);
router.get("/my-list", requirePermission("recurring.operate"), getMyRecurring);
router.post("/", requirePermission("recurring.manage"), validate({ body: routeBody }), createRecurring);
router.post("/:id/assign", requirePermission("recurring.manage"), validate({ params: idParam, body: assignGuardBody }), assignGuard);
router.put("/:id", requirePermission("recurring.manage"), validate({ params: routeParams, body: routeBody }), updateRecurring);
router.put("/:id/toggle", requirePermission("recurring.manage"), validate({ params: idParam, body: toggleRecurringBody }), toggleRecurring);
router.delete("/:id", requirePermission("recurring.manage"), deleteRecurring);

export default router;
