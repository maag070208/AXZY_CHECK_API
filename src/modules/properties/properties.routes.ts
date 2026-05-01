import { Router } from "express";
import { addProperty, getDataTable, getProperties, getProperty, putProperty, removeProperty } from "./properties.controller";

const router = Router();

router.post("/datatable", getDataTable);

router.get("/", getProperties);
router.get("/:id", getProperty);
router.post("/", addProperty);
router.put("/:id", putProperty);
router.delete("/:id", removeProperty);

export default router;
