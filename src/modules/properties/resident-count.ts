import { Prisma } from "@prisma/client";
import { prismaClient } from "@src/core/config/database";

type Client = Prisma.TransactionClient | typeof prismaClient;

/**
 * Recalcula `residentCount` de cada propiedad indicada: residentes activos (rol RESDN)
 * vinculados. Llamarla en la misma transacción que el cambio de vínculo (T-A1-06).
 */
export const recountResidents = async (propertyIds: Array<number | null | undefined>, client: Client = prismaClient) => {
  const ids = [...new Set(propertyIds.filter((id): id is number => typeof id === "number"))];
  for (const id of ids) {
    const count = await client.user.count({
      where: { propertyId: id, active: true, role: { name: "RESDN" } },
    });
    await client.property.updateMany({ where: { id }, data: { residentCount: count } });
  }
};

/** Propiedades cuyo conteo guardado no coincide con los residentes reales. Debe estar vacío (T-A1-T6). */
export const findResidentCountDrift = () =>
  prismaClient.$queryRaw<{ id: number; stored: number; actual: number }[]>`
    SELECT p."id", p."residentCount"::int AS stored, COUNT(u."id")::int AS actual
    FROM "Property" p
    LEFT JOIN "User" u ON u."propertyId" = p."id" AND u."active" = true
      AND u."roleId" = (SELECT r."id" FROM "Role" r WHERE r."name" = 'RESDN')
    GROUP BY p."id", p."residentCount"
    HAVING p."residentCount" <> COUNT(u."id")
  `;
