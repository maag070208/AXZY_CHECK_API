import { Router } from "express";
import * as uniformController from "./uniform.controller";
import { authenticate } from "../common/middlewares/auth.middleware";
import { requirePermission } from "../common/middlewares/require-permission.middleware";
import { validate } from "@src/core/validation/validate";
import { createUniformCheckBody } from "./uniform.schemas";

const router = Router();

router.use(authenticate, requirePermission("uniform.manage"));

router.post("/", validate({ body: createUniformCheckBody }), uniformController.createUniformCheck);
router.post("/datatable", uniformController.getDataTable);
router.get("/by-guard/:guardId", uniformController.getByGuard);

export default router;
