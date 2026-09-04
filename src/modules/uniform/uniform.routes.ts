import { Router } from "express";
import * as uniformController from "./uniform.controller";
import { authenticate } from "../common/middlewares/auth.middleware";
import { requireRole } from "../common/middlewares/role.middleware";

const router = Router();

router.use(authenticate, requireRole(["ADMIN", "SHIFT"]));

router.post("/", uniformController.createUniformCheck);
router.post("/datatable", uniformController.getDataTable);
router.get("/by-guard/:guardId", uniformController.getByGuard);

export default router;
