import { Router } from "express";
import { requireRole } from "@src/modules/common/middlewares/role.middleware";
import { create, getAll, remove, update, getDataTable } from "./schedule.controller";

const router = Router();

router.post("/datatable", getDataTable);

router.get("/", getAll);
router.post("/", requireRole(["ADMIN"]), create);
router.put("/:id", requireRole(["ADMIN"]), update);
router.delete("/:id", requireRole(["ADMIN"]), remove);

export default router;
