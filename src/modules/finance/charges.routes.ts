import { Router } from "express";
import { validate } from "@src/core/validation/validate";
import { idParam } from "@src/core/validation/common";
import { requirePermission } from "@src/modules/common/middlewares/require-permission.middleware";
import {
  cancelChargeBody,
  createChargeBody,
  listChargesQuery,
  monthlyChargesBody,
} from "./finance.schemas";
import {
  getCharges,
  patchCancelCharge,
  postCharge,
  postMonthlyCharges,
} from "./finance.controller";

const router = Router();

router.get("/", requirePermission("charge.view"), validate({ query: listChargesQuery }), getCharges);
router.post("/", requirePermission("charge.manage"), validate({ body: createChargeBody }), postCharge);
router.post(
  "/monthly",
  requirePermission("charge.manage"),
  validate({ body: monthlyChargesBody }),
  postMonthlyCharges,
);
router.patch(
  "/:id/cancel",
  requirePermission("charge.manage"),
  validate({ params: idParam, body: cancelChargeBody }),
  patchCancelCharge,
);

export default router;
