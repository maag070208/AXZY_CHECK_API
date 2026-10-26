import { Router } from "express";
import { validate } from "@src/core/validation/validate";
import { idParam } from "@src/core/validation/common";
import { requirePermission } from "@src/modules/common/middlewares/require-permission.middleware";
import {
  deleteException,
  getEvents,
  getExceptions,
  getRule,
  getStatus,
  postException,
  putRule,
} from "./access-control.controller";
import {
  accessEventsQuery,
  accessExceptionBody,
  accessExceptionQuery,
  accessStatusQuery,
  delinquencyRuleBody,
} from "./access-control.schemas";

const router = Router();

router.get("/status", requirePermission("access.check"), validate({ query: accessStatusQuery }), getStatus);
router.get("/delinquency-rule", requirePermission("delinquency.view"), getRule);
router.put("/delinquency-rule", requirePermission("delinquency.manage"), validate({ body: delinquencyRuleBody }), putRule);
router.get("/events", requirePermission("access.event.view"), validate({ query: accessEventsQuery }), getEvents);
router.get("/exceptions", requirePermission("delinquency.view"), validate({ query: accessExceptionQuery }), getExceptions);
router.post("/exceptions", requirePermission("delinquency.manage"), validate({ body: accessExceptionBody }), postException);
router.delete("/exceptions/:id", requirePermission("delinquency.manage"), validate({ params: idParam }), deleteException);

export default router;
