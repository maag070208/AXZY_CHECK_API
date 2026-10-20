import { Router } from "express";
import { createAssignment, getAllAssignments, getMyAssignments, updateStatus, toggleTask, getDataTable } from "./assignment.controller";
import { requirePermission } from "../common/middlewares/require-permission.middleware";
import { validate } from "@src/core/validation/validate";
import { idParam } from "@src/core/validation/common";
import { createAssignmentBody, updateAssignmentStatusBody } from "./assignment.schemas";

const router = Router();


// Jefe de guardias / administración: asignar y revisar.
router.post("/", requirePermission("assignments.manage"), validate({ body: createAssignmentBody }), createAssignment);
router.post("/datatable", requirePermission("assignments.manage"), getDataTable);
router.get("/", requirePermission("assignments.manage"), getAllAssignments);
router.get("/all", requirePermission("assignments.manage"), getAllAssignments);
router.patch("/:id/status", requirePermission("assignments.manage"), validate({ params: idParam, body: updateAssignmentStatusBody }), updateStatus);

// Personal operativo: ver las suyas y completar tareas.
router.get("/me", getMyAssignments);
router.patch("/tasks/:taskId/toggle", toggleTask);

export default router;
