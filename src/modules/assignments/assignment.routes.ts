
import { Router } from "express";
import { createAssignment, getAllAssignments, getMyAssignments, updateStatus, toggleTask, getDataTable } from "./assignment.controller";
import { authenticate } from "../common/middlewares/auth.middleware";

const router = Router();

// Admin / Shift Guard Routes
router.post("/", createAssignment); // TODO: Add Role Middleware
router.post("/datatable", getDataTable);
router.get("/", getAllAssignments); // TODO: Add Role Middleware
router.get("/all", getAllAssignments);

// Guard Routes
router.get("/me", authenticate, getMyAssignments);

// Shared / System
router.patch("/:id/status", updateStatus);
router.patch("/tasks/:taskId/toggle", toggleTask);

export default router;
