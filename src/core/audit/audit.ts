import { Prisma } from "@prisma/client";
import { prismaClient } from "@src/core/config/database";

/**
 * [T-F0-12] Bitácora de cambios administrativos. Se escribe dentro de la misma
 * transacción que el cambio, así que no hay cambio sin registro ni al revés.
 * No guardar secretos ni datos personales en before/after.
 */
export interface AuditEntry {
  actorId: number | null;
  action: string;
  entity: string;
  entityId: string | number;
  before?: unknown;
  after?: unknown;
}

export const recordAudit = (entry: AuditEntry, tx: Prisma.TransactionClient = prismaClient) =>
  tx.auditLog.create({
    data: {
      actorId: entry.actorId,
      action: entry.action,
      entity: entry.entity,
      entityId: String(entry.entityId),
      before: entry.before === undefined ? Prisma.DbNull : (entry.before as Prisma.InputJsonValue),
      after: entry.after === undefined ? Prisma.DbNull : (entry.after as Prisma.InputJsonValue),
    },
  });
