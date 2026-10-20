import { Router } from "express";
import { createAssignment, getAllAssignments, getMyAssignments, updateStatus, toggleTask, getDataTable } from "./assignment.controller";
import { requireRole } from "../common/middlewares/role.middleware";

const router = Router();

const MANAGERS = ["ADMIN", "SHIFT"];

// Jefe de guardias / administración: asignar y revisar.
router.post("/", requireRole(MANAGERS), createAssignment);
router.post("/datatable", requireRole(MANAGERS), getDataTable);
router.get("/", requireRole(MANAGERS), getAllAssignments);
router.get("/all", requireRole(MANAGERS), getAllAssignments);
router.patch("/:id/status", requireRole(MANAGERS), updateStatus);

// Personal operativo: ver las suyas y completar tareas.
router.get("/me", getMyAssignments);
router.patch("/tasks/:taskId/toggle", toggleTask);

export default router;
