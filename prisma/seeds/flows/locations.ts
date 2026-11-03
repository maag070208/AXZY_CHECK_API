import { PrismaClient } from "@prisma/client";
import { FLOW_LOCATIONS } from "./constants";

/** Flujo "ubicaciones": cuatro puntos de ronda del cliente indicado. Idempotente por nombre. */
export const locationsFlow = async (prisma: PrismaClient, clientId: number): Promise<number[]> => {
  const ids: number[] = [];
  for (const loc of FLOW_LOCATIONS) {
    const row = await prisma.location.upsert({
      where: { clientId_name: { clientId, name: loc.name } },
      update: {},
      create: { ...loc, clientId },
    });
    ids.push(row.id);
  }
  return ids;
};
