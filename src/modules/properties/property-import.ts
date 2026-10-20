import { z } from "zod";
import { prismaClient } from "@src/core/config/database";
import { AppError } from "@src/core/errors/app-error";
import { createPropertyForImport } from "./properties.service";

/** Máximo de filas por importación: evita transacciones enormes en una sola petición. */
export const IMPORT_MAX_ROWS = 500;

/**
 * Fila de importación (CSV ya convertido a objetos por la WEB). Usa los códigos de catálogo nuevos:
 * tipo (HOUSE, APARTMENT…) y ocupación inicial (VACANT, OWNER_OCCUPIED…).
 */
const importRow = z.object({
  identifier: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1).max(120),
  mainStreet: z.string().trim().min(1).max(200),
  kind: z.string().trim().min(1).max(40),
  occupancy: z.string().trim().min(1).max(40),
  floor: z.coerce.number().int().min(0).max(200).nullish(),
  unitNumber: z.string().trim().max(20).nullish(),
});

/**
 * Importa filas válidas y reporta las inválidas (T-A1-T7): una fila mala no aborta el lote.
 * Cada fila se crea en su propia transacción.
 */
export const importProperties = async (rows: unknown[]) => {
  if (!Array.isArray(rows) || rows.length === 0) throw new AppError("IMPORT_EMPTY", "No hay filas para importar", 400);
  if (rows.length > IMPORT_MAX_ROWS) throw new AppError("IMPORT_TOO_MANY", `Máximo ${IMPORT_MAX_ROWS} filas por importación`, 400);

  const kinds = new Map((await prismaClient.propertyKind.findMany()).map((k) => [k.code, k.id]));
  const occupancies = new Map((await prismaClient.occupancyStatus.findMany()).map((o) => [o.code, o.id]));
  const created: number[] = [];
  const errors: { row: number; messages: string[] }[] = [];

  for (const [index, raw] of rows.entries()) {
    const parsed = importRow.safeParse(raw);
    if (!parsed.success) {
      errors.push({ row: index + 1, messages: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) });
      continue;
    }
    const row = parsed.data;
    const kindId = kinds.get(row.kind);
    const occupancyStatusId = occupancies.get(row.occupancy);
    if (!kindId) {
      errors.push({ row: index + 1, messages: [`kind: tipo "${row.kind}" no existe`] });
      continue;
    }
    if (!occupancyStatusId) {
      errors.push({ row: index + 1, messages: [`occupancy: ocupación "${row.occupancy}" no existe`] });
      continue;
    }
    try {
      const property = await createPropertyForImport({
        identifier: row.identifier,
        name: row.name,
        mainStreet: row.mainStreet,
        floor: row.floor ?? null,
        unitNumber: row.unitNumber ?? null,
        kindId,
        occupancyStatusId,
      });
      created.push(property.id);
    } catch (error: any) {
      const duplicate = error?.code === "P2002";
      errors.push({ row: index + 1, messages: [duplicate ? "identifier: ya existe" : String(error?.message ?? error)] });
    }
  }

  return { created: created.length, createdIds: created, errors };
};
