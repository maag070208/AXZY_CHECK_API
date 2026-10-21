import { PrismaClient } from "@prisma/client";
import { FLOW_LOCATIONS } from "./constants";

/** Flujo "ubicaciones": cuatro puntos de ronda. Idempotente por nombre. */
export const locationsFlow = async (prisma: PrismaClient): Promise<number[]> => {
  const ids: number[] = [];
  for (const loc of FLOW_LOCATIONS) {
    const row = await prisma.location.upsert({ where: { name: loc.name }, update: {}, create: { ...loc } });
    ids.push(row.id);
  }
  return ids;
};
