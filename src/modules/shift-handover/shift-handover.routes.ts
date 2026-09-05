import { Router } from "express";
import * as shiftHandoverController from "./shift-handover.controller";
import { authenticate } from "../common/middlewares/auth.middleware";
import { requireRole } from "../common/middlewares/role.middleware";

const router = Router();

router.use(authenticate, requireRole(["ADMIN", "SHIFT"]));

router.post("/", shiftHandoverController.createShiftHandover);
router.post("/datatable", shiftHandoverController.getDataTable);
router.get("/pending", shiftHandoverController.getPending);
router.get("/:id", shiftHandoverController.getById);

export default router;
