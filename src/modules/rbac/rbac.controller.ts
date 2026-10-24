import { Request, Response } from "express";
import { createTResult } from "@src/core/mappers/tresult.mapper";
import { respondError } from "@src/core/errors/http-error";
import * as rbacService from "./rbac.service";

export const getMatrix = async (_req: Request, res: Response) => {
  try {
    return res.status(200).json(createTResult(await rbacService.getRbacMatrix()));
  } catch (error: any) {
    return respondError(res, error);
  }
};

export const updateRole = async (req: Request, res: Response) => {
  try {
    const { roleName } = req.params;
    const { permissions } = req.body;
    const matrix = await rbacService.updateRolePermissions(roleName, permissions);
    return res.status(200).json(createTResult(matrix));
  } catch (error: any) {
    return respondError(res, error);
  }
};
