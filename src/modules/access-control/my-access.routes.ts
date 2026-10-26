import { Router } from "express";
import { validate } from "@src/core/validation/validate";
import { requirePermission } from "@src/modules/common/middlewares/require-permission.middleware";
import { myEvents } from "./my-access.controller";
import { accessEventsQuery } from "./access-control.schemas";

const router = Router();
router.get("/events", requirePermission("resident.self"), validate({ query: accessEventsQuery }), myEvents);
export default router;
