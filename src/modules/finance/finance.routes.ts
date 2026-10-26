import { Router } from "express";
import { requirePermission } from "@src/modules/common/middlewares/require-permission.middleware";
import { getSummary } from "./finance.controller";

const router = Router();

router.get("/summary", requirePermission("charge.manage"), getSummary);

export default router;
