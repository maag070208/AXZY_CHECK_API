
import { Request, Response } from "express";
import * as assignmentService from "./assignment.service";
import { AssignmentStatus } from "@prisma/client";
import { createTResult } from "@src/core/mappers/tresult.mapper";

export const createAssignment = async (req: Request, res: Response) => {
  try {
    const { guardId, locationId, notes, tasks, assignedBy: bodyAssignedBy } = req.body;
    const assignedBy = bodyAssignedBy;
    console.log({
      assignedBy,
      guardId,
      locationId,
      notes,
      tasks,
    });
    const result = await assignmentService.createAssignment({
      guardId: Number(guardId),
      locationId: Number(locationId),
      assignedBy: Number(assignedBy),
      notes,
      tasks,
    });

    return res.status(201).json(createTResult(result));
  } catch (error: any) {
    return res.status(400).json(createTResult(null, error.message));
  }
};

export const getMyAssignments = async (req: Request, res: Response) => {
  try {
    const { guardId: queryGuardId } = req.query;
    const guardId =  Number(queryGuardId);
    if (!guardId) return res.status(401).json(createTResult(null, ["Unauthorized"]));

    const result = await assignmentService.getAssignmentsByGuard(Number(guardId));
    return res.status(200).json(createTResult(result));
  } catch (error: any) {
    return res.status(500).json(createTResult(null, error.message));
  }
};

export const getAllAssignments = async (req: Request, res: Response) => {
    try {
        const { guardId, status, id } = req.query;
        const result = await assignmentService.getAllAssignments({ 
            id: id ? Number(id) : undefined,
            guardId: guardId ? Number(guardId) : undefined,
            status: status as AssignmentStatus
        });
        return res.status(200).json(createTResult(result));
    } catch (error: any) {
        return res.status(500).json(createTResult(null, error.message));
    }
}

export const updateStatus = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const result = await assignmentService.updateAssignmentStatus(Number(id), status);
        return res.status(200).json(createTResult(result));
    } catch (error: any) {
        return res.status(500).json(createTResult(null, error.message));
    }
}

export const toggleTask = async (req: Request, res: Response) => {
    try {
        const { taskId } = req.params;
        const result = await assignmentService.toggleAssignmentTask(Number(taskId));
        return res.status(200).json(createTResult(result));
    } catch (error: any) {
        return res.status(500).json(createTResult(null, error.message));
    }
}
