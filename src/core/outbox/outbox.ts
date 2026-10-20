import { OutboxEvent, Prisma } from "@prisma/client";
import { prismaClient } from "@src/core/config/database";
import { notifyUsersHandler } from "./handlers";

/**
 * [T-F0-10] Outbox: los efectos secundarios (notificaciones, push) se registran en
 * la misma operación que el cambio de negocio y se entregan después, con reintentos
 * y dead-letter. Entrega "al menos una vez": los handlers deben tolerar repetir.
 */
export type OutboxHandler = (event: OutboxEvent, payload: unknown) => Promise<void>;

export const OUTBOX_HANDLERS: Record<string, OutboxHandler> = {
  "notification.send": notifyUsersHandler,
};

export const MAX_ATTEMPTS = 3;
/** Un evento reclamado queda oculto este tiempo; si el proceso muere, otro lo retoma. */
const LEASE_MS = 5 * 60 * 1000;
const BACKOFF_BASE_MS = 30 * 1000;

/** Espera antes del siguiente intento: 30 s, 60 s, 120 s… */
export const backoffMs = (attempts: number): number => BACKOFF_BASE_MS * 2 ** (attempts - 1);

/** Encola un evento. Pasar `tx` para que se escriba en la misma transacción que el cambio de negocio. */
export const enqueueOutbox = (type: string, payload: Prisma.InputJsonValue, tx: Prisma.TransactionClient = prismaClient) =>
  // Reloj de la aplicación (no now() de la base): el worker compara con el mismo reloj.
  tx.outboxEvent.create({ data: { type, payload, nextAttemptAt: new Date() } });

/**
 * Reclama hasta `batchSize` eventos vencidos con SKIP LOCKED: dos procesos
 * concurrentes nunca toman el mismo evento.
 */
const claimDueEvents = (now: Date, batchSize: number) =>
  prismaClient.$queryRaw<OutboxEvent[]>`
    UPDATE "OutboxEvent"
    SET "nextAttemptAt" = ${new Date(now.getTime() + LEASE_MS)}
    WHERE "id" IN (
      SELECT "id" FROM "OutboxEvent"
      WHERE "status" = 'PENDING' AND "nextAttemptAt" <= ${now}
      ORDER BY "id"
      LIMIT ${batchSize}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING *`;

/**
 * Procesa los eventos vencidos. Devuelve cuántos se procesaron.
 * `handlers` e `now` se inyectan para las pruebas.
 */
export const processOutbox = async (
  now: Date = new Date(),
  handlers: Record<string, OutboxHandler> = OUTBOX_HANDLERS,
  batchSize = 50
): Promise<number> => {
  const events = await claimDueEvents(now, batchSize);

  for (const event of events) {
    try {
      const handler = handlers[event.type];
      if (!handler) throw new Error(`Sin handler para ${event.type}`);
      await handler(event, event.payload);
      await prismaClient.outboxEvent.update({
        where: { id: event.id },
        data: { status: "SENT", sentAt: now, attempts: { increment: 1 }, lastError: null },
      });
    } catch (error) {
      const attempts = event.attempts + 1;
      const dead = attempts >= MAX_ATTEMPTS;
      await prismaClient.outboxEvent.update({
        where: { id: event.id },
        data: {
          status: dead ? "DEAD" : "PENDING",
          attempts,
          lastError: String((error as Error)?.message ?? error).slice(0, 500),
          nextAttemptAt: dead ? now : new Date(now.getTime() + backoffMs(attempts)),
        },
      });
    }
  }

  return events.length;
};
