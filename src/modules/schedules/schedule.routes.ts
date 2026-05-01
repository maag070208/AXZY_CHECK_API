import { Router } from "express";
import { create, getAll, remove, update, getDataTable } from "./schedule.controller";

const router = Router();

router.post("/datatable", getDataTable);

router.get("/", getAll);
router.post("/", create);
router.put("/:id", update);
router.delete("/:id", remove);

export default router;
