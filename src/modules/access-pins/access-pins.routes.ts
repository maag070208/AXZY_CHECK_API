import { Router } from "express";
import { validate as validateBody } from "@src/core/validation/validate";
import { requirePermission } from "@src/modules/common/middlewares/require-permission.middleware";
import { generate, mine, qrRevoke, qrStatus, qrToken, qrValidate, revoke, validate } from "./access-pins.controller";
import { createPinBody, pinBody, qrTokenBody } from "./access-pins.schemas";

const router = Router();

router.get("/me", requirePermission("accesspin.manage"), mine);
router.post("/me", requirePermission("accesspin.manage"), validateBody({ body: createPinBody }), generate);
router.delete("/me", requirePermission("accesspin.manage"), revoke);
router.post("/validate", requirePermission("accesspin.validate"), validateBody({ body: pinBody }), validate);
router.get("/me/qr", requirePermission("accesspin.manage"), qrStatus);
router.post("/me/qr/token", requirePermission("accesspin.manage"), validateBody({ body: createPinBody }), qrToken);
router.delete("/me/qr", requirePermission("accesspin.manage"), qrRevoke);
router.post("/pass/validate", requirePermission("accesspin.validate"), validateBody({ body: qrTokenBody }), qrValidate);

export default router;
