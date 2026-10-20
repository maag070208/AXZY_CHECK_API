import { Router } from "express";
import { requireRole } from "@src/modules/common/middlewares/role.middleware";
import { addProperty, getDataTable, getProperties, getProperty, putProperty, removeProperty } from "./properties.controller";

const router = Router();

router.post("/datatable", getDataTable);

router.get("/", getProperties);
router.get("/:id", getProperty);
router.post("/", requireRole(["ADMIN"]), addProperty);
router.put("/:id", requireRole(["ADMIN"]), putProperty);
router.delete("/:id", requireRole(["ADMIN"]), removeProperty);

export default router;
