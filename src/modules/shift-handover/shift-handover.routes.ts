import { Router } from "express";
import * as shiftHandoverController from "./shift-handover.controller";
import { authenticate } from "../common/middlewares/auth.middleware";
import { requirePermission } from "../common/middlewares/require-permission.middleware";
import { validate } from "@src/core/validation/validate";
import { createShiftHandoverBody } from "./shift-handover.schemas";

const router = Router();

router.use(authenticate, requirePermission("shift-handover.manage"));

router.post("/", validate({ body: createShiftHandoverBody }), shiftHandoverController.createShiftHandover);
router.post("/datatable", shiftHandoverController.getDataTable);
router.get("/pending", shiftHandoverController.getPending);
router.get("/:id", shiftHandoverController.getById);

export default router;
