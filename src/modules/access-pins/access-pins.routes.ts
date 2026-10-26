import { Router } from "express";
import { validate as validateBody } from "@src/core/validation/validate";
import { requirePermission } from "@src/modules/common/middlewares/require-permission.middleware";
import { generate, mine, revoke, validate } from "./access-pins.controller";
import { pinBody } from "./access-pins.schemas";

const router = Router();

router.get("/me", requirePermission("accesspin.manage"), mine);
router.post("/me", requirePermission("accesspin.manage"), generate);
router.delete("/me", requirePermission("accesspin.manage"), revoke);
router.post("/validate", requirePermission("accesspin.validate"), validateBody({ body: pinBody }), validate);

export default router;
