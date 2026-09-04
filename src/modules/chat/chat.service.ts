import { prismaClient } from "@src/core/config/database";

/**
 * @description Roles allowed to participate in the operational team's group
 * chat. Residents (RESDN) are intentionally excluded — this channel is only
 * for administración, guardias, jefe de guardias y mantenimiento.
 */
export const CHAT_ALLOWED_ROLES = ["ADMIN", "GUARD", "SHIFT", "MAINT"] as const;

const messageSelect = {
  id: true,
  message: true,
  createdAt: true,
  user: {
    select: {
      id: true,
      name: true,
      lastName: true,
      role: { select: { name: true, value: true } },
    },
  },
} as const;

/**
 * @description Lists chat messages, newest first, keyset-paginated by `id`
 * so the client can load older history on scroll.
 * @param cursor Id of the oldest message already loaded (exclusive), or undefined for the first page.
 * @param limit Page size (default 30).
 */
export const getMessages = async (cursor?: number, limit = 30) => {
  const messages = await prismaClient.chatMessage.findMany({
    where: cursor ? { id: { lt: cursor } } : undefined,
    select: messageSelect,
    orderBy: { id: "desc" },
    take: limit,
  });
  return messages;
};

/**
 * @description Persists a new chat message from an authenticated team member.
 * @param userId Id of the sender.
 * @param message Message text (already trimmed/validated by the controller).
 */
export const createMessage = async (userId: number, message: string) => {
  const created = await prismaClient.chatMessage.create({
    data: { userId, message },
    select: messageSelect,
  });
  return created;
};
