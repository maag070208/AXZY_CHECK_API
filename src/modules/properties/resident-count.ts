import { Prisma } from "@prisma/client";
import { prismaClient } from "@src/core/config/database";

type Client = Prisma.TransactionClient | typeof prismaClient;

/**
 * Recalcula `residentCount` de cada propiedad: residentes ACTIVOS cuyo tipo cuenta como miembro
 * del hogar (T-A2-T3: el personal doméstico y los autorizados no suman). Llamarla en la misma
 * transacción que el cambio de vínculo (T-A1-06).
 */
export const recountResidents = async (propertyIds: Array<number | null | undefined>, client: Client = prismaClient) => {
  const ids = [...new Set(propertyIds.filter((id): id is number => typeof id === "number"))];
  for (const id of ids) {
    const count = await client.resident.count({
      where: { propertyId: id, status: "ACTIVE", kind: { isHouseholdMember: true } },
    });
    await client.property.updateMany({ where: { id }, data: { residentCount: count } });
  }
};

/** Propiedades cuyo conteo guardado no coincide con el hogar real. Debe estar vacío (T-A1-T6). */
export const findResidentCountDrift = () =>
  prismaClient.$queryRaw<{ id: number; stored: number; actual: number }[]>`
    SELECT p."id", p."residentCount"::int AS stored, COUNT(r."id")::int AS actual
    FROM "Property" p
    LEFT JOIN "Resident" r ON r."propertyId" = p."id" AND r."status" = 'ACTIVE'
    LEFT JOIN "ResidentKind" k ON k."id" = r."kindId" AND k."isHouseholdMember" = true
    GROUP BY p."id", p."residentCount"
    HAVING p."residentCount" <> COUNT(k."id")
  `;
