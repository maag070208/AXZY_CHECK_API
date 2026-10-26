import { Router } from "express";
import { validate } from "@src/core/validation/validate";
import { requirePermission } from "@src/modules/common/middlewares/require-permission.middleware";
import { access, approve, createMine, deactivate, deleteMine, list, lookup, myVehicles, reject, updateMine } from "./vehicles.controller";
import { accessBody, approveBody, rejectBody, vehicleBody, vehicleIdParam, vehicleLookupQuery, vehicleQuery } from "./vehicles.schemas";

const router = Router();

// Residente: solo lo propio.
router.get("/me", requirePermission("vehicle.self"), myVehicles);
router.post("/me", requirePermission("vehicle.self"), validate({ body: vehicleBody }), createMine);
router.put("/me/:id", requirePermission("vehicle.self"), validate({ params: vehicleIdParam, body: vehicleBody }), updateMine);
router.delete("/me/:id", requirePermission("vehicle.self"), validate({ params: vehicleIdParam }), deleteMine);

// Caseta: consulta y registro manual.
router.get("/lookup", requirePermission("access.check"), validate({ query: vehicleLookupQuery }), lookup);
router.post("/:id/access", requirePermission("access.check"), validate({ params: vehicleIdParam, body: accessBody }), access);

// Administración.
router.get("/", requirePermission("vehicle.view"), validate({ query: vehicleQuery }), list);
router.patch("/:id/approve", requirePermission("vehicle.manage"), validate({ params: vehicleIdParam, body: approveBody }), approve);
router.patch("/:id/reject", requirePermission("vehicle.manage"), validate({ params: vehicleIdParam, body: rejectBody }), reject);
router.delete("/:id", requirePermission("vehicle.manage"), validate({ params: vehicleIdParam }), deactivate);

export default router;
