import { AnnouncementAudience, Prisma } from "@prisma/client";
import { prismaClient } from "@src/core/config/database";
import { AppError } from "@src/core/errors/app-error";
import { enqueueOutbox } from "@src/core/outbox/outbox";

type CreateInput = {
  title: string;
  body: string;
  audience: AnnouncementAudience;
  propertyId?: number;
  roleName?: string;
};

const serializeAnnouncement = (announcement: any) => {
  const recipients = announcement.notifications?.length ?? 0;
  const readCount = (announcement.notifications ?? []).filter((n: any) => n.readAt).length;
  return {
    id: announcement.id,
    title: announcement.title,
    body: announcement.body,
    audience: announcement.audience,
    propertyId: announcement.propertyId,
    property: announcement.property ?? null,
    roleName: announcement.roleName,
    sentAt: announcement.sentAt.toISOString(),
    createdAt: announcement.createdAt.toISOString(),
    createdBy: announcement.createdBy ?? null,
    recipients,
    readCount,
  };
};

const recipientsFor = async (input: CreateInput) => {
  if (input.audience === AnnouncementAudience.PROPERTY) {
    const property = await prismaClient.property.findFirst({
      where: { id: input.propertyId, softDelete: false },
      select: { id: true },
    });
    if (!property) throw new AppError("PROPERTY_NOT_FOUND", "Propiedad no encontrada", 404);
  }

  if (input.audience === AnnouncementAudience.ROLE) {
    const role = await prismaClient.role.findUnique({ where: { name: input.roleName }, select: { name: true } });
    if (!role) throw new AppError("ROLE_NOT_FOUND", "Rol no encontrado", 404);
  }

  const where: Prisma.UserWhereInput = {
    active: true,
    softDelete: false,
    role: { name: input.audience === AnnouncementAudience.ROLE ? input.roleName : "RESDN" },
    ...(input.audience === AnnouncementAudience.PROPERTY ? { propertyId: input.propertyId } : {}),
  };

  return prismaClient.user.findMany({ where, select: { id: true } });
};

export const createAnnouncement = async (input: CreateInput, actorId: number) => {
  const recipients = await recipientsFor(input);
  if (recipients.length === 0) {
    throw new AppError("ANNOUNCEMENT_NO_RECIPIENTS", "No hay destinatarios con ese criterio", 400);
  }

  const announcement = await prismaClient.$transaction(async (tx) => {
    const created = await tx.announcement.create({
      data: {
        title: input.title.trim(),
        body: input.body.trim(),
        audience: input.audience,
        propertyId: input.audience === AnnouncementAudience.PROPERTY ? input.propertyId : null,
        roleName: input.audience === AnnouncementAudience.ROLE ? input.roleName ?? null : null,
        createdById: actorId,
      },
    });

    await tx.notification.createMany({
      data: recipients.map((recipient) => ({
        userId: recipient.id,
        announcementId: created.id,
        title: created.title,
        body: created.body,
      })),
    });

    return tx.announcement.findUniqueOrThrow({
      where: { id: created.id },
      include: { property: { select: { id: true, identifier: true, name: true } }, createdBy: { select: { id: true, name: true, lastName: true } }, notifications: { select: { readAt: true } } },
    });
  });

  await enqueueOutbox("push.send", {
    userIds: recipients.map((recipient) => recipient.id),
    title: announcement.title,
    body: announcement.body,
    data: { announcementId: String(announcement.id) },
  });

  return serializeAnnouncement(announcement);
};

export const listAnnouncements = async (query: { page: number; pageSize: number }) => {
  const [items, total] = await prismaClient.$transaction([
    prismaClient.announcement.findMany({
      orderBy: { sentAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: {
        property: { select: { id: true, identifier: true, name: true } },
        createdBy: { select: { id: true, name: true, lastName: true } },
        notifications: { select: { readAt: true } },
      },
    }),
    prismaClient.announcement.count(),
  ]);

  return { items: items.map(serializeAnnouncement), total, page: query.page, pageSize: query.pageSize };
};

export const listMyNotifications = async (userId: number, query: { page: number; pageSize: number }) => {
  const [items, total] = await prismaClient.$transaction([
    prismaClient.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: { announcement: { select: { id: true, title: true, body: true } } },
    }),
    prismaClient.notification.count({ where: { userId } }),
  ]);
  return { items, total, page: query.page, pageSize: query.pageSize };
};

export const unreadNotificationCount = async (userId: number) => {
  return prismaClient.notification.count({ where: { userId, readAt: null } });
};

export const registerPushDevice = async (userId: number, token: string, platform: "android" | "ios") => {
  return prismaClient.pushDevice.upsert({
    where: { token },
    update: { userId, platform, lastSeenAt: new Date() },
    create: { userId, token, platform },
    select: { id: true, token: true, platform: true, lastSeenAt: true },
  });
};

export const markNotificationRead = async (userId: number, id: number) => {
  const notification = await prismaClient.notification.findFirst({ where: { id, userId } });
  if (!notification) throw new AppError("NOTIFICATION_NOT_FOUND", "Aviso no encontrado", 404);
  if (notification.readAt) return notification;
  return prismaClient.notification.update({ where: { id }, data: { readAt: new Date() } });
};
