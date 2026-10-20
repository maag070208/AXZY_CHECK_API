import { Router } from "express";
import { requirePermission } from "@src/modules/common/middlewares/require-permission.middleware";
import { create, getAll, remove, update, getDataTable } from "./schedule.controller";

const router = Router();

router.post("/datatable", getDataTable);

router.get("/", getAll);
router.post("/", requirePermission("schedules.manage"), create);
router.put("/:id", requirePermission("schedules.manage"), update);
router.delete("/:id", requirePermission("schedules.manage"), remove);

export default router;
