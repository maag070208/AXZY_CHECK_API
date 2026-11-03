import { Router } from "express";
import { validate } from "@src/core/validation/validate";
import { idParam } from "@src/core/validation/common";
import { requirePermission } from "@src/modules/common/middlewares/require-permission.middleware";
import { createGuardAssignmentBody, listGuardAssignmentsQuery } from "./guard-assignments.schemas";
import { create, end, get, list } from "./guard-assignments.controller";

const router = Router();

router.get("/", requirePermission("guard.assign"), validate({ query: listGuardAssignmentsQuery }), list);
router.get("/:id", requirePermission("guard.assign"), validate({ params: idParam }), get);
router.post("/", requirePermission("guard.assign"), validate({ body: createGuardAssignmentBody }), create);
router.post("/:id/end", requirePermission("guard.assign"), validate({ params: idParam }), end);

export default router;
