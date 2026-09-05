import { Request, Response } from "express";
import { createTResult } from "@src/core/mappers/tresult.mapper";
import * as shiftHandoverService from "./shift-handover.service";

/** @description POST /shift-handover — creates a report with its elements. */
export const createShiftHandover = async (req: Request, res: Response) => {
  try {
    // @ts-ignore - attached by `authenticate`
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json(createTResult(null, ["Usuario no autenticado"]));
    }

    const {
      shiftType,
      handoverDate,
      credentialsCount,
      tarjetonesCount,
      novedades,
      checklistPhones,
      checklistTablet,
      checklistRadios,
      checklistKeys,
      checklistLogbook,
      checklistConsignas,
      reportedToAdmin,
      elements,
    } = req.body;

    if (!shiftType || !["MATUTINO", "NOCTURNO"].includes(shiftType)) {
      return res.status(400).json(createTResult(null, ["Turno inválido"]));
    }
    if (!handoverDate) {
      return res.status(400).json(createTResult(null, ["La fecha del turno es requerida"]));
    }
    if (!reportedToAdmin) {
      return res
        .status(400)
        .json(createTResult(null, ["Debes confirmar que se reportaron las novedades a la administración"]));
    }

    const created = await shiftHandoverService.createShiftHandover({
      shiftType,
      handoverDate: String(handoverDate),
      credentialsCount: credentialsCount !== undefined ? Number(credentialsCount) : undefined,
      tarjetonesCount: tarjetonesCount !== undefined ? Number(tarjetonesCount) : undefined,
      novedades,
      checklistPhones: Boolean(checklistPhones),
      checklistTablet: Boolean(checklistTablet),
      checklistRadios: Boolean(checklistRadios),
      checklistKeys: Boolean(checklistKeys),
      checklistLogbook: Boolean(checklistLogbook),
      checklistConsignas: Boolean(checklistConsignas),
      reportedToAdmin: Boolean(reportedToAdmin),
      createdById: Number(userId),
      elements: Array.isArray(elements)
        ? elements.map((el: any) => ({
            guardId: Number(el.guardId),
            entryTime: String(el.entryTime),
            punctual: el.punctual !== undefined ? Boolean(el.punctual) : true,
            observations: el.observations,
          }))
        : [],
    });

    return res.status(201).json(createTResult(created));
  } catch (error: any) {
    // Unique constraint (shiftType + handoverDate) -> a report for that shift/day already exists.
    if (error.code === "P2002") {
      return res
        .status(400)
        .json(createTResult(null, ["Ya existe un reporte de entrega de turno para este turno y fecha"]));
    }
    return res.status(500).json(createTResult(null, [error.message]));
  }
};

/** @description GET /shift-handover/datatable — for the WEB `ITDataTable`. */
export const getDataTable = async (req: Request, res: Response) => {
  try {
    const result = await shiftHandoverService.getDataTableShiftHandovers(req.body);
    return res.status(200).json(createTResult(result));
  } catch (error: any) {
    return res.status(500).json(createTResult(null, [error.message]));
  }
};

/** @description GET /shift-handover/pending — used by the APP alert banner. */
export const getPending = async (req: Request, res: Response) => {
  try {
    const result = await shiftHandoverService.getPendingShiftHandover();
    return res.status(200).json(createTResult(result));
  } catch (error: any) {
    return res.status(500).json(createTResult(null, [error.message]));
  }
};

/** @description GET /shift-handover/:id — full report detail. */
export const getById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await shiftHandoverService.getShiftHandoverById(Number(id));
    if (!result) {
      return res.status(404).json(createTResult(null, ["Reporte no encontrado"]));
    }
    return res.status(200).json(createTResult(result));
  } catch (error: any) {
    return res.status(500).json(createTResult(null, [error.message]));
  }
};
