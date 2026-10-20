import { z } from "zod";
import { OutboxEvent } from "@prisma/client";
import { prismaClient } from "@src/core/config/database";
import { getPushSender, PushTokenInvalidError } from "@src/core/push/push-sender";

const notificationPayload = z.object({
  userIds: z.array(z.number().int().positive()).min(1),
  title: z.string().min(1).max(120),
  body: z.string().min(1).max(500),
  data: z.record(z.string(), z.string()).optional(),
});

/**
 * Crea una notificación por usuario (`skipDuplicates`: un reintento no duplica
 * filas) y envía push a los dispositivos registrados, si hay remitente.
 * Un token inválido se elimina; otros errores fallan el evento para reintentarlo.
 */
export const notifyUsersHandler = async (event: OutboxEvent, payload: unknown): Promise<void> => {
  const { userIds, title, body, data } = notificationPayload.parse(payload);
  await prismaClient.notification.createMany({
    data: userIds.map((userId) => ({ userId, outboxEventId: event.id, title, body, data })),
    skipDuplicates: true,
  });

  const sender = getPushSender();
  if (!sender) return;

  const devices = await prismaClient.pushDevice.findMany({
    where: { userId: { in: userIds } },
    select: { id: true, token: true },
  });
  for (const device of devices) {
    try {
      await sender.send(device.token, { title, body, data });
    } catch (error) {
      if (error instanceof PushTokenInvalidError) {
        await prismaClient.pushDevice.delete({ where: { id: device.id } });
      } else {
        throw error;
      }
    }
  }
};
