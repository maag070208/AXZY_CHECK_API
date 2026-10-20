import { Router } from "express";
import * as catalogAdminController from "./catalog-admin.controller";
import { authenticate } from "../common/middlewares/auth.middleware";
import { requirePermission } from "../common/middlewares/require-permission.middleware";
import { validate } from "@src/core/validation/validate";
import { idParam } from "@src/core/validation/common";
import { createCategoryBody, updateCategoryBody, createTypeBody, updateTypeBody, reorderBody } from "./catalog-admin.schemas";

const router = Router();

// Only ADMIN manages catalogs — this is the module requested in
// "3. Catálogo de incidencias → CRUD de catálogos".
router.use(authenticate, requirePermission("catalogs.manage"));

// Categories
router.get("/categories", catalogAdminController.getCategories);
router.post("/categories", validate({ body: createCategoryBody }), catalogAdminController.createCategory);
router.put("/categories/reorder", validate({ body: reorderBody }), catalogAdminController.reorderCategories);
router.put("/categories/:id/pin", catalogAdminController.pinCategory);
router.put("/categories/:id", validate({ params: idParam, body: updateCategoryBody }), catalogAdminController.updateCategory);
router.delete("/categories/:id", catalogAdminController.deleteCategory);

// Types
router.get("/types", catalogAdminController.getTypes);
router.post("/types", validate({ body: createTypeBody }), catalogAdminController.createType);
router.put("/types/reorder", validate({ body: reorderBody }), catalogAdminController.reorderTypes);
router.put("/types/:id/pin", catalogAdminController.pinType);
router.put("/types/:id", validate({ params: idParam, body: updateTypeBody }), catalogAdminController.updateType);
router.delete("/types/:id", catalogAdminController.deleteType);

export default router;
