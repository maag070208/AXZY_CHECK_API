import { Request, Response } from "express";
import { createTResult } from "@src/core/mappers/tresult.mapper";
import { respondError } from "@src/core/errors/http-error";
import { createClient, listClients, updateClient } from "./clients.service";

export const list = async (req: Request, res: Response) => {
  try {
    return res.status(200).json(createTResult(await listClients(req.scope)));
  } catch (error: unknown) {
    return respondError(res, error);
  }
};

export const create = async (req: Request, res: Response) => {
  try {
    return res.status(201).json(createTResult(await createClient(req.scope, req.body)));
  } catch (error: unknown) {
    return respondError(res, error);
  }
};

export const patch = async (req: Request, res: Response) => {
  try {
    return res.status(200).json(createTResult(await updateClient(req.scope, Number(req.params.id), req.body)));
  } catch (error: unknown) {
    return respondError(res, error);
  }
};
