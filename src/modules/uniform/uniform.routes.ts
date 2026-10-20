import { Router } from "express";
import * as uniformController from "./uniform.controller";
import { authenticate } from "../common/middlewares/auth.middleware";
import { requirePermission } from "../common/middlewares/require-permission.middleware";

const router = Router();

router.use(authenticate, requirePermission("uniform.manage"));

router.post("/", uniformController.createUniformCheck);
router.post("/datatable", uniformController.getDataTable);
router.get("/by-guard/:guardId", uniformController.getByGuard);

export default router;
