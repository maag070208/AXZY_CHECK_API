import { Router } from "express";
import { requirePermission } from "@src/modules/common/middlewares/require-permission.middleware";
import { create, getAll, remove, update, getDataTable } from "./schedule.controller";
import { validate } from "@src/core/validation/validate";
import { idParam } from "@src/core/validation/common";
import { createScheduleBody, updateScheduleBody } from "./schedule.schemas";

const router = Router();

router.post("/datatable", getDataTable);

router.get("/", getAll);
router.post("/", requirePermission("schedules.manage"), validate({ body: createScheduleBody }), create);
router.put("/:id", requirePermission("schedules.manage"), validate({ params: idParam, body: updateScheduleBody }), update);
router.delete("/:id", requirePermission("schedules.manage"), remove);

export default router;
