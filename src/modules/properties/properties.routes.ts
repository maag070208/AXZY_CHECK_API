import { Router } from "express";
import { requirePermission } from "@src/modules/common/middlewares/require-permission.middleware";
import { addProperty, getDataTable, getProperties, getProperty, putProperty, removeProperty } from "./properties.controller";

const router = Router();

router.post("/datatable", getDataTable);

router.get("/", getProperties);
router.get("/:id", getProperty);
router.post("/", requirePermission("properties.manage"), addProperty);
router.put("/:id", requirePermission("properties.manage"), putProperty);
router.delete("/:id", requirePermission("properties.manage"), removeProperty);

export default router;
