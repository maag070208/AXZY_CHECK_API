import { Request, Response } from "express";
import { createTResult } from "@src/core/mappers/tresult.mapper";
import * as uniformService from "./uniform.service";

/** @description POST /uniform — records a uniform/grooming checklist for a guard. */
export const createUniformCheck = async (req: Request, res: Response) => {
  try {
    // @ts-ignore - attached by `authenticate`
    const evaluatorId = req.user?.id;
    if (!evaluatorId) {
      return res.status(401).json(createTResult(null, ["Usuario no autenticado"]));
    }

    const { guardId, pantalon, botas, cinturon, camisa, pluma, gorra, unas, orejas, desodorante, afeitado, peinado, notes } =
      req.body;

    if (!guardId) {
      return res.status(400).json(createTResult(null, ["Selecciona el guardia a evaluar"]));
    }

    const created = await uniformService.createUniformCheck({
      guardId: Number(guardId),
      evaluatedById: Number(evaluatorId),
      pantalon: Boolean(pantalon),
      botas: Boolean(botas),
      cinturon: Boolean(cinturon),
      camisa: Boolean(camisa),
      pluma: Boolean(pluma),
      gorra: Boolean(gorra),
      unas: Boolean(unas),
      orejas: Boolean(orejas),
      desodorante: Boolean(desodorante),
      afeitado: Boolean(afeitado),
      peinado: Boolean(peinado),
      notes,
    });

    return res.status(201).json(createTResult(created));
  } catch (error: any) {
    return res.status(500).json(createTResult(null, [error.message]));
  }
};

/** @description POST /uniform/datatable — for the WEB `ITDataTable`. */
export const getDataTable = async (req: Request, res: Response) => {
  try {
    const result = await uniformService.getDataTableUniformChecks(req.body);
    return res.status(200).json(createTResult(result));
  } catch (error: any) {
    return res.status(500).json(createTResult(null, [error.message]));
  }
};

/** @description GET /uniform/by-guard/:guardId — history for one guard (APP). */
export const getByGuard = async (req: Request, res: Response) => {
  try {
    const { guardId } = req.params;
    const result = await uniformService.getUniformChecksByGuard(Number(guardId));
    return res.status(200).json(createTResult(result));
  } catch (error: any) {
    return res.status(500).json(createTResult(null, [error.message]));
  }
};
