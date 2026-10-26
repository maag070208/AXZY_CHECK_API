import { Router } from "express";
import { validate } from "@src/core/validation/validate";
import { idParam } from "@src/core/validation/common";
import { requirePermission } from "@src/modules/common/middlewares/require-permission.middleware";
import { createPaymentBody, listPaymentsQuery, voidPaymentBody } from "./finance.schemas";
import { getPayments, getReceipt, postPayment, postVoidPayment } from "./finance.controller";

const router = Router();

router.get("/", requirePermission("payment.view"), validate({ query: listPaymentsQuery }), getPayments);
router.post("/", requirePermission("payment.manage"), validate({ body: createPaymentBody }), postPayment);
router.get(
  "/:id/receipt",
  requirePermission("payment.view"),
  validate({ params: idParam }),
  getReceipt,
);
router.post(
  "/:id/void",
  requirePermission("payment.manage"),
  validate({ params: idParam, body: voidPaymentBody }),
  postVoidPayment,
);

export default router;
