import { Router } from "express";
import { createAssignment, finishAssignment, getAssignments } from "./key-assignments.controller";

const router = Router();

router.get("/", getAssignments);
router.post("/", createAssignment);
router.put("/:id/finish", finishAssignment);

export default router;
