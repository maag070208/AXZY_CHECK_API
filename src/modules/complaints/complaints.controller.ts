import { Request, Response } from "express";
import { createTResult } from "@src/core/mappers/tresult.mapper";
import { respondError } from "@src/core/errors/http-error";
import { roleHasPermission } from "@src/core/permissions/permissions.service";
import * as complaintService from "./complaints.service";

/** Actor autenticado. `authenticate` corre antes, así que `req.user` existe. */
const actorOf = async (req: Request): Promise<complaintService.ComplaintActor> => {
  const user = req.user as { id: number; role: string };
  return { id: Number(user.id), canManage: await roleHasPermission(user.role, "complaint.manage") };
};

export const listComplaints = async (req: Request, res: Response) => {
  try {
    const result = await complaintService.listComplaints(await actorOf(req), req.query as any);
    return res.status(200).json(createTResult(result));
  } catch (error: unknown) {
    return respondError(res, error);
  }
};

export const createComplaint = async (req: Request, res: Response) => {
  try {
    const result = await complaintService.createComplaint(await actorOf(req), req.body);
    return res.status(201).json(createTResult(result));
  } catch (error: unknown) {
    return respondError(res, error);
  }
};

export const getComplaint = async (req: Request, res: Response) => {
  try {
    const result = await complaintService.getComplaint(await actorOf(req), Number(req.params.id));
    return res.status(200).json(createTResult(result));
  } catch (error: unknown) {
    return respondError(res, error);
  }
};

export const addComplaintMessage = async (req: Request, res: Response) => {
  try {
    const result = await complaintService.addComplaintMessage(await actorOf(req), Number(req.params.id), req.body);
    return res.status(201).json(createTResult(result));
  } catch (error: unknown) {
    return respondError(res, error);
  }
};

export const changeComplaintStatus = async (req: Request, res: Response) => {
  try {
    const result = await complaintService.changeComplaintStatus(await actorOf(req), Number(req.params.id), req.body.status);
    return res.status(200).json(createTResult(result));
  } catch (error: unknown) {
    return respondError(res, error);
  }
};
