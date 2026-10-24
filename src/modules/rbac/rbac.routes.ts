import { Router } from "express";
import { requirePermission } from "@src/modules/common/middlewares/require-permission.middleware";
import { authenticate } from "../common/middlewares/auth.middleware";
import { validate } from "@src/core/validation/validate";
import { roleNameParam, updateRolePermissionsBody } from "./rbac.schemas";
import { getMatrix, updateRole } from "./rbac.controller";

const router = Router();

router.use(authenticate, requirePermission("users.manage"));

router.get("/matrix", getMatrix);
router.put(
  "/roles/:roleName/permissions",
  validate({ params: roleNameParam, body: updateRolePermissionsBody }),
  updateRole,
);

export default router;
