import { Request, Response } from "express";
import { createTResult } from "@src/core/mappers/tresult.mapper";
import { changelogQuerySchema } from "./sync.dto";
import { getBootstrapForGuard, getChangelogForGuard } from "./sync.service";

/**
 * @description GET /api/v1/sync/bootstrap
 * Todo lo que el guardia necesita para operar offline desde cero (rutas,
 * checkpoints, tareas, asignaciones especiales, catálogos y ronda activa).
 * La APP lo llama cada vez que detecta conexión para refrescar su copia local.
 */
export const getBootstrap = async (req: Request, res: Response): Promise<Response> => {
  try {
    // @ts-ignore — el middleware de auth inyecta `req.user`.
    const userId: number | undefined = req.user?.id;
    if (!userId) {
      return res.status(401).json(createTResult(null, ["Usuario no autenticado"]));
    }

    const data = await getBootstrapForGuard(Number(userId));
    return res.status(200).json(createTResult(data));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    return res.status(500).json(createTResult(null, [message]));
  }
};

/**
 * @description GET /api/v1/sync/changelog?since=ISO
 * Deltas (agregado/modificado) desde `since` para refrescar de forma
 * incremental lo que ya se descargó con /sync/bootstrap.
 */
export const getChangelog = async (req: Request, res: Response): Promise<Response> => {
  try {
    const parsed = changelogQuerySchema.safeParse({ query: req.query });
    if (!parsed.success) {
      return res.status(400).json(createTResult(null, ["Parámetros de consulta no válidos"]));
    }

    // @ts-ignore — el middleware de auth inyecta `req.user`.
    const userId: number | undefined = req.user?.id;
    if (!userId) {
      return res.status(401).json(createTResult(null, ["Usuario no autenticado"]));
    }

    const data = await getChangelogForGuard(Number(userId), parsed.data.query.since);
    return res.status(200).json(createTResult(data));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    return res.status(500).json(createTResult(null, [message]));
  }
};
