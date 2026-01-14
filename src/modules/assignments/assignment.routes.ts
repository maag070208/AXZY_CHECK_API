
import { Router } from "express";
import { createAssignment, getAllAssignments, getMyAssignments, updateStatus, toggleTask } from "./assignment.controller";
import { authenticate } from "../common/middlewares/auth.middleware";

const router = Router();

// Admin / Shift Guard Routes
router.post("/", createAssignment); // TODO: Add Role Middleware
router.get("/", getAllAssignments); // TODO: Add Role Middleware

// Guard Routes
router.get("/me", authenticate, getMyAssignments);

// Shared / System
router.patch("/:id/status", updateStatus);
router.patch("/tasks/:taskId/toggle", toggleTask);

export default router;
