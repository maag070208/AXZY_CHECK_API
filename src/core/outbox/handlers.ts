import { z } from "zod";
import { OutboxEvent } from "@prisma/client";
import { prismaClient } from "@src/core/config/database";

const notificationPayload = z.object({
  userIds: z.array(z.number().int().positive()).min(1),
  title: z.string().min(1).max(120),
  body: z.string().min(1).max(500),
  data: z.record(z.string(), z.string()).optional(),
});

/**
 * Crea una notificación por usuario. `skipDuplicates` (índice único por evento y
 * usuario) hace que un reintento no duplique filas.
 */
export const notifyUsersHandler = async (event: OutboxEvent, payload: unknown): Promise<void> => {
  const { userIds, title, body, data } = notificationPayload.parse(payload);
  await prismaClient.notification.createMany({
    data: userIds.map((userId) => ({ userId, outboxEventId: event.id, title, body, data })),
    skipDuplicates: true,
  });
};
