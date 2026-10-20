import { Router } from "express";
import { requireRole } from "@src/modules/common/middlewares/role.middleware";
import { addLocation, getLocations, putLocation, removeLocation, getDataTable } from "./locations.controller";

const router = Router();

router.post("/datatable", getDataTable);

router.get("/", getLocations);
router.post("/", requireRole(["ADMIN", "SHIFT"]), addLocation);
router.put("/:id", requireRole(["ADMIN", "SHIFT"]), putLocation);
router.delete("/:id", requireRole(["ADMIN", "SHIFT"]), removeLocation);

export default router;
