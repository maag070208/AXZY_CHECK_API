import { AnnouncementAudience, Prisma } from "@prisma/client";
import { prismaClient } from "@src/core/config/database";
import { AppError } from "@src/core/errors/app-error";
import { enqueueOutbox } from "@src/core/outbox/outbox";
import { ClientScope, scopeByClient } from "@src/core/scope/client-scope";

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

/**
 * Multicliente: los destinatarios son siempre del cliente del aviso.
 * - PROPERTY y ALL (residentes): usuarios RESDN con propiedad de ese cliente.
 * - ROLE: los RESDN por su propiedad; guardias y jefes de turno por su asignación abierta al cliente;
 *   el personal de organización (ADMIN, MAINT, …) por la organización del alcance.
 */
const recipientsFor = async (input: CreateInput, scope: ClientScope | undefined) => {
  const { clientId } = scopeByClient(scope);

  if (input.audience === AnnouncementAudience.PROPERTY) {
    const property = await prismaClient.property.findFirst({
      where: { id: input.propertyId, softDelete: false, ...scopeByClient(scope) },
      select: { id: true },
    });
    if (!property) throw new AppError("PROPERTY_NOT_FOUND", "Propiedad no encontrada", 404);
  }

  if (input.audience === AnnouncementAudience.ROLE) {
    const role = await prismaClient.role.findUnique({ where: { name: input.roleName }, select: { name: true } });
    if (!role) throw new AppError("ROLE_NOT_FOUND", "Rol no encontrado", 404);
  }

  const roleName = input.audience === AnnouncementAudience.ROLE ? input.roleName ?? null : "RESDN";
  const base: Prisma.UserWhereInput = { active: true, softDelete: false };

  // Residentes: el residente llega al cliente por la propiedad donde vive.
  const residentWhere: Prisma.UserWhereInput =
    input.audience === AnnouncementAudience.PROPERTY
      ? { ...base, role: { name: "RESDN" }, propertyId: input.propertyId }
      : { ...base, role: { name: "RESDN" }, property: { clientId } };

  if (roleName === "RESDN") {
    return prismaClient.user.findMany({ where: residentWhere, select: { id: true } });
  }

  if (roleName === "GUARD" || roleName === "SHIFT") {
    return prismaClient.user.findMany({
      where: {
        ...base,
        role: { name: roleName },
        ...(scope?.organizationId != null ? { organizationId: scope.organizationId } : {}),
        guardAssignments: { some: { clientId, endsAt: null } },
      },
      select: { id: true },
    });
  }

  // Personal de organización: no tiene asignación por cliente; el aviso es de la organización.
  return prismaClient.user.findMany({
    where: {
      ...base,
      role: { name: roleName ?? undefined },
      ...(scope?.organizationId != null ? { organizationId: scope.organizationId } : {}),
    },
    select: { id: true },
  });
};

export const createAnnouncement = async (input: CreateInput, actorId: number, scope: ClientScope | undefined) => {
  const { clientId } = scopeByClient(scope);
  const recipients = await recipientsFor(input, scope);
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
        clientId,
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

export const listAnnouncements = async (query: { page: number; pageSize: number }, scope: ClientScope | undefined) => {
  const { clientId } = scopeByClient(scope);
  const [items, total] = await prismaClient.$transaction([
    prismaClient.announcement.findMany({
      where: { clientId },
      orderBy: { sentAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: {
        property: { select: { id: true, identifier: true, name: true } },
        createdBy: { select: { id: true, name: true, lastName: true } },
        notifications: { select: { readAt: true } },
      },
    }),
    prismaClient.announcement.count({ where: { clientId } }),
  ]);

  return { items: items.map(serializeAnnouncement), total, page: query.page, pageSize: query.pageSize };
};

type SendNotificationInput = {
  userIds: number[];
  title: string;
  body: string;
  data?: Record<string, string>;
};

/** Manda un aviso a usuarios concretos por el outbox (bandeja + push, con reintentos). */
export const sendDirectNotification = async (input: SendNotificationInput, scope: ClientScope | undefined) => {
  // Solo usuarios de la organización de quien envía: no se notifica a otra cuenta.
  const found = await prismaClient.user.count({
    where: {
      id: { in: input.userIds },
      ...(scope?.organizationId != null ? { organizationId: scope.organizationId } : {}),
    },
  });
  if (found !== input.userIds.length) {
    throw new AppError("NOTIFICATION_USER_NOT_FOUND", "Hay usuarios que no existen", 404);
  }
  await enqueueOutbox("notification.send", {
    userIds: input.userIds,
    title: input.title,
    body: input.body,
    ...(input.data ? { data: input.data } : {}),
  });
  return { recipients: input.userIds.length };
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
