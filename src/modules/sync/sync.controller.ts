import { Request, Response } from "express";
import { createTResult } from "@src/core/mappers/tresult.mapper";
import { changelogQuerySchema } from "./sync.dto";
import { getChangelogForGuard } from "./sync.service";

/**
 * @description GET /api/v1/sync/changelog
 * Devuelve los cambios (rutas, ubicaciones, asignaciones especiales y catálogos)
 * relevantes para el guardia autenticado desde la marca `since`. El cliente usa
 * `serverTime` como cursor para la siguiente llamada.
 * @param req.query.since ISO datetime opcional (default: hace 30 días).
 * @returns 200 con `ChangelogResponse` envuelto en TResult.
 */
export const getChangelog = async (
  req: Request,
  res: Response,
): Promise<Response> => {
  try {
    const parsed = changelogQuerySchema.safeParse({ query: req.query });
    if (!parsed.success) {
      return res
        .status(400)
        .json(createTResult(null, ["Parámetros de consulta no válidos"]));
    }

    // @ts-ignore — el middleware de auth inyecta `req.user`.
    const userId: number | undefined = req.user?.id;
    if (!userId) {
      return res
        .status(401)
        .json(createTResult(null, ["Usuario no autenticado"]));
    }

    const data = await getChangelogForGuard(
      Number(userId),
      parsed.data.query.since,
    );
    return res.status(200).json(createTResult(data));
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Error desconocido";
    return res.status(500).json(createTResult(null, [message]));
  }
};
