import { Router } from "express";
import { requirePermission } from "@src/modules/common/middlewares/require-permission.middleware";
import { addLocation, getLocations, putLocation, removeLocation, getDataTable } from "./locations.controller";

const router = Router();

router.post("/datatable", getDataTable);

router.get("/", getLocations);
router.post("/", requirePermission("locations.manage"), addLocation);
router.put("/:id", requirePermission("locations.manage"), putLocation);
router.delete("/:id", requirePermission("locations.manage"), removeLocation);

export default router;
