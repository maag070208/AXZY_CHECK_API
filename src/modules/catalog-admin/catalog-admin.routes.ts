import { Router } from "express";
import * as catalogAdminController from "./catalog-admin.controller";
import { authenticate } from "../common/middlewares/auth.middleware";
import { requireRole } from "../common/middlewares/role.middleware";

const router = Router();

// Only ADMIN manages catalogs — this is the module requested in
// "3. Catálogo de incidencias → CRUD de catálogos".
router.use(authenticate, requireRole(["ADMIN"]));

// Categories
router.get("/categories", catalogAdminController.getCategories);
router.post("/categories", catalogAdminController.createCategory);
router.put("/categories/reorder", catalogAdminController.reorderCategories);
router.put("/categories/:id/pin", catalogAdminController.pinCategory);
router.put("/categories/:id", catalogAdminController.updateCategory);
router.delete("/categories/:id", catalogAdminController.deleteCategory);

// Types
router.get("/types", catalogAdminController.getTypes);
router.post("/types", catalogAdminController.createType);
router.put("/types/reorder", catalogAdminController.reorderTypes);
router.put("/types/:id/pin", catalogAdminController.pinType);
router.put("/types/:id", catalogAdminController.updateType);
router.delete("/types/:id", catalogAdminController.deleteType);

export default router;
