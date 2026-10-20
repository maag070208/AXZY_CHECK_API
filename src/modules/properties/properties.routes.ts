import { Router } from "express";
import { createTResult } from "@src/core/mappers/tresult.mapper";
import { requirePermission } from "@src/modules/common/middlewares/require-permission.middleware";
import { addProperty, getDataTable, getProperties, getProperty, putProperty, removeProperty } from "./properties.controller";
import { validate } from "@src/core/validation/validate";
import { idParam } from "@src/core/validation/common";
import { createPropertyBody, updatePropertyBody } from "./property.schemas";
import { changeOccupancyBody, changeOwnershipBody } from "./occupancy.schemas";
import { getPropertyOccupancy, postPropertyOccupancy, postPropertyOwnership } from "./occupancy.controller";
import { addHouseholdResidentBody } from "../residents/household.schemas";
import { importProperties, IMPORT_MAX_ROWS } from "./property-import";
import { listKinds, listOccupancyStatuses, occupancyStats } from "./occupancy.service";
import { z } from "zod";
import { getHousehold, postHouseholdResident } from "../residents/household.controller";

const router = Router();

router.post("/datatable", getDataTable);

router.get("/", requirePermission("properties.view"), getProperties);

// Catálogos y estadísticas de ocupación (A1). Antes de /:id: son rutas fijas.
router.get("/kinds", requirePermission("properties.view"), async (_req, res, next) => {
  try {
    return res.status(200).json(createTResult(await listKinds()));
  } catch (error) {
    return next(error);
  }
});
router.get("/occupancy-statuses", requirePermission("properties.view"), async (_req, res, next) => {
  try {
    return res.status(200).json(createTResult(await listOccupancyStatuses()));
  } catch (error) {
    return next(error);
  }
});
router.get("/stats/occupancy", requirePermission("properties.view"), async (_req, res, next) => {
  try {
    return res.status(200).json(createTResult(await occupancyStats()));
  } catch (error) {
    return next(error);
  }
});

// Importación desde CSV (T-A1-07): filas válidas se crean; las inválidas se reportan.
const importBody = z.object({ rows: z.array(z.unknown()).max(IMPORT_MAX_ROWS) });
router.post("/import", requirePermission("properties.manage"), validate({ body: importBody }), async (req, res, next) => {
  try {
    return res.status(200).json(createTResult(await importProperties(req.body.rows)));
  } catch (error) {
    return next(error);
  }
});
router.get("/:id", requirePermission("properties.view"), getProperty);
router.post("/", requirePermission("properties.manage"), validate({ body: createPropertyBody }), addProperty);
router.put("/:id", requirePermission("properties.manage"), validate({ params: idParam, body: updatePropertyBody }), putProperty);
router.delete("/:id", requirePermission("properties.manage"), removeProperty);

// Ocupación (A1): consulta con historial; cambio transaccional; cambio de propietario.
router.get("/:id/occupancy", requirePermission("properties.view"), validate({ params: idParam }), getPropertyOccupancy);
router.post("/:id/occupancy", requirePermission("occupancy.change"), validate({ params: idParam, body: changeOccupancyBody }), postPropertyOccupancy);
// Hogar (A2): residentes que suman al conteo, con titular único.
router.get("/:id/residents", requirePermission("properties.view"), validate({ params: idParam }), getHousehold);
router.post("/:id/residents", requirePermission("residents.manage"), validate({ params: idParam, body: addHouseholdResidentBody }), postHouseholdResident);
router.post("/:id/ownership", requirePermission("properties.manage"), validate({ params: idParam, body: changeOwnershipBody }), postPropertyOwnership);

export default router;
