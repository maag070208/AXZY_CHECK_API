import { createTResult } from "@src/core/mappers/tresult.mapper";
import { Request, Response } from "express";
import {
  createNovedad,
  getAblyTokenRequest,
  getNovedades,
} from "./novedades.service";
import { createNovedadSchema, novedadQuerySchema } from "./novedades.dto";

/**
 * @description GET /api/v1/novedades
 * Devuelve el historial de novedades paginado (más recientes primero).
 */
export const listNovedades = async (req: Request, res: Response) => {
  try {
    const parsed = novedadQuerySchema.safeParse({ query: req.query });
    if (!parsed.success) {
      return res.status(400).json(createTResult(null, ["Parámetros de consulta no válidos"]));
    }
    const result = await getNovedades(parsed.data.query);
    return res.status(200).json(createTResult(result));
  } catch (error: any) {
    return res.status(500).json(createTResult(null, [error.message]));
  }
};

/**
 * @description POST /api/v1/novedades
 * Crea una novedad (persiste en BD y la difunde en tiempo real por Ably).
 */
export const createNovedadController = async (req: Request, res: Response) => {
  try {
    const parsed = createNovedadSchema.safeParse({ body: req.body });
    if (!parsed.success) {
      return res.status(400).json(createTResult(null, ["Carga útil no válida"]));
    }
    // @ts-ignore
    const actor = { id: req.user?.id, role: req.user?.role };
    if (!actor.id) {
      return res.status(401).json(createTResult(null, ["Usuario no autenticado"]));
    }
    const result = await createNovedad(parsed.data.body, actor);
    return res.status(201).json(createTResult(result));
  } catch (error: any) {
    const message = error.message?.includes("no autorizado") ? error.message : error.message;
    const status = error.message?.includes("no autorizado") ? 403 : 500;
    return res.status(status).json(createTResult(null, [message]));
  }
};

/**
 * @description GET /api/v1/novedades/ably-token
 * Devuelve una solicitud de token de Ably para conectar el cliente en tiempo real.
 */
export const getNovedadesAblyToken = async (req: Request, res: Response) => {
  try {
    // @ts-ignore
    const actor = { id: req.user?.id, role: req.user?.role };
    if (!actor.id) {
      return res.status(401).json(createTResult(null, ["Usuario no autenticado"]));
    }
    const tokenRequest = await getAblyTokenRequest(actor);
    return res.status(200).json(createTResult(tokenRequest));
  } catch (error: any) {
    const status = error.message?.includes("no autorizado") ? 403 : 500;
    return res.status(status).json(createTResult(null, [error.message]));
  }
};
