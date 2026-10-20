import { Router } from "express";
import { requirePermission } from "@src/modules/common/middlewares/require-permission.middleware";
import { addLocation, getLocations, putLocation, removeLocation, getDataTable } from "./locations.controller";
import { validate } from "@src/core/validation/validate";
import { idParam } from "@src/core/validation/common";
import { addLocationBody, putLocationBody } from "./location.schemas";

const router = Router();

router.post("/datatable", getDataTable);

router.get("/", getLocations);
router.post("/", requirePermission("locations.manage"), validate({ body: addLocationBody }), addLocation);
router.put("/:id", requirePermission("locations.manage"), validate({ params: idParam, body: putLocationBody }), putLocation);
router.delete("/:id", requirePermission("locations.manage"), removeLocation);

export default router;
