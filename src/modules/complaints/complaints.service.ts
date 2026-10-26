import { ComplaintStatus, Prisma, ResidentStatus } from "@prisma/client";
import type { z } from "zod";
import { prismaClient } from "@src/core/config/database";
import { ABLY_CHANNELS, publishToChannel } from "@src/core/config/ably";
import { AppError } from "@src/core/errors/app-error";
import { assertStatusUpdated, assertTransition, COMPLAINT_TRANSITIONS } from "@src/core/transitions/transitions";
import type { createComplaintBody, listComplaintsQuery } from "./complaints.schemas";

type CreateComplaintInput = z.infer<typeof createComplaintBody>;
type ListComplaintsInput = z.output<typeof listComplaintsQuery>;

/** Quién actúa. `canManage` = tiene `complaint.manage` (personal); el residente solo ve las suyas. */
export type ComplaintActor = { id: number; canManage: boolean };

const AUTHOR_SELECT = { select: { id: true, name: true, lastName: true } } as const;

/** Propiedad activa del residente: Person.userId → Resident (ACTIVE). Null si no tiene ninguna. */
export const residentPropertyId = async (userId: number): Promise<number | null> => {
  const resident = await prismaClient.resident.findFirst({
    where: { status: ResidentStatus.ACTIVE, person: { userId }, property: { softDelete: false } },
    orderBy: [{ isPrimary: "desc" }, { id: "asc" }],
    select: { propertyId: true },
  });
  return resident?.propertyId ?? null;
};

const canSee = (actor: ComplaintActor, complaint: { authorId: number }) => actor.canManage || complaint.authorId === actor.id;

const notFound = () => new AppError("COMPLAINT_NOT_FOUND", "Queja no encontrada", 404);

/** Días que el residente tiene para reabrir una queja RESOLVED. */
export const REOPEN_WINDOW_DAYS = 7;
const REOPEN_WINDOW_MS = REOPEN_WINDOW_DAYS * 24 * 60 * 60 * 1000;

/**
 * Cierre automático: una queja RESOLVED que pasó la ventana de reapertura se
 * cierra sola. Se ejecuta de forma perezosa al leer/listar. El evento queda con
 * `byUserId = null` porque lo hizo el sistema.
 */
export const closeExpiredResolvedComplaints = async (): Promise<number> => {
  const cutoff = new Date(Date.now() - REOPEN_WINDOW_MS);
  const expired = await prismaClient.complaint.findMany({
    where: { status: ComplaintStatus.RESOLVED, resolvedAt: { lt: cutoff } },
    select: { id: true },
  });

  let closed = 0;
  for (const row of expired) {
    await prismaClient.$transaction(async (tx) => {
      const updated = await tx.complaint.updateMany({
        where: { id: row.id, status: ComplaintStatus.RESOLVED },
        data: { status: ComplaintStatus.CLOSED },
      });
      if (updated.count > 0) {
        await tx.complaintEvent.create({
          data: { complaintId: row.id, fromStatus: ComplaintStatus.RESOLVED, toStatus: ComplaintStatus.CLOSED, byUserId: null },
        });
        closed += 1;
      }
    });
  }
  return closed;
};

export const createComplaint = async (actor: ComplaintActor, data: CreateComplaintInput) => {
  const propertyId = await residentPropertyId(actor.id);
  if (!propertyId) throw new AppError("NO_ACTIVE_RESIDENCE", "Tu cuenta no está ligada a una propiedad activa", 403);

  const complaint = await prismaClient.$transaction(async (tx) => {
    const created = await tx.complaint.create({
      data: {
        propertyId,
        authorId: actor.id,
        category: data.category,
        title: data.title,
        description: data.description,
        media: data.media?.length ? (data.media as Prisma.InputJsonValue) : undefined,
      },
    });
    await tx.complaintEvent.create({
      data: { complaintId: created.id, fromStatus: null, toStatus: ComplaintStatus.NEW, byUserId: actor.id },
    });
    return created;
  });

  void publishToChannel(ABLY_CHANNELS.DASHBOARD_LIVE, "refresh", { reason: "complaint-created", complaintId: complaint.id });
  return complaint;
};

export const listComplaints = async (actor: ComplaintActor, query: ListComplaintsInput) => {
  await closeExpiredResolvedComplaints();
  const where: Prisma.ComplaintWhereInput = {
    ...(actor.canManage ? {} : { authorId: actor.id }),
    ...(query.status && { status: query.status }),
    ...(query.category && { category: query.category }),
  };
  const [items, total] = await prismaClient.$transaction([
    prismaClient.complaint.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      select: { id: true, propertyId: true, category: true, title: true, status: true, createdAt: true, updatedAt: true, authorId: true, author: AUTHOR_SELECT },
    }),
    prismaClient.complaint.count({ where }),
  ]);
  return { items, total, page: query.page, pageSize: query.pageSize };
};

export const getComplaint = async (actor: ComplaintActor, id: number) => {
  await closeExpiredResolvedComplaints();
  const complaint = await prismaClient.complaint.findUnique({
    where: { id },
    include: {
      author: AUTHOR_SELECT,
      messages: {
        where: actor.canManage ? undefined : { internal: false },
        orderBy: { createdAt: "asc" },
        select: { id: true, body: true, internal: true, authorId: true, createdAt: true },
      },
      events: { orderBy: { createdAt: "asc" }, select: { fromStatus: true, toStatus: true, createdAt: true } },
    },
  });
  if (!complaint || !canSee(actor, complaint)) throw notFound();
  return complaint;
};

export const addComplaintMessage = async (
  actor: ComplaintActor,
  id: number,
  data: { body: string; internal: boolean },
) => {
  const complaint = await prismaClient.complaint.findUnique({ where: { id }, select: { id: true, authorId: true, status: true } });
  if (!complaint || !canSee(actor, complaint)) throw notFound();
  if (data.internal && !actor.canManage) throw new AppError("FORBIDDEN", "No tienes permisos para realizar esta acción", 403);
  if (!actor.canManage && (complaint.status === ComplaintStatus.RESOLVED || complaint.status === ComplaintStatus.CLOSED)) {
    throw new AppError("COMPLAINT_CLOSED", "La queja ya está cerrada; no admite más mensajes en esta versión", 409);
  }

  return prismaClient.$transaction(async (tx) => {
    const message = await tx.complaintMessage.create({
      data: { complaintId: id, authorId: actor.id, body: data.body, internal: data.internal },
      select: { id: true, body: true, internal: true, authorId: true, createdAt: true },
    });
    // Si el residente responde a una petición de información, la queja vuelve a revisión.
    if (!actor.canManage && complaint.status === ComplaintStatus.WAITING_RESIDENT) {
      const moved = await tx.complaint.updateMany({
        where: { id, status: ComplaintStatus.WAITING_RESIDENT },
        data: { status: ComplaintStatus.IN_REVIEW },
      });
      assertStatusUpdated(moved.count);
      await tx.complaintEvent.create({
        data: { complaintId: id, fromStatus: ComplaintStatus.WAITING_RESIDENT, toStatus: ComplaintStatus.IN_REVIEW, byUserId: actor.id },
      });
    }
    return message;
  });
};

export const changeComplaintStatus = async (actor: ComplaintActor, id: number, to: ComplaintStatus) => {
  const complaint = await prismaClient.complaint.findUnique({ where: { id }, select: { id: true, authorId: true, status: true } });
  if (!complaint || !canSee(actor, complaint)) throw notFound();

  // El residente solo puede dar por buena una queja resuelta (RESOLVED → CLOSED).
  if (!actor.canManage && !(complaint.status === ComplaintStatus.RESOLVED && to === ComplaintStatus.CLOSED)) {
    throw new AppError("FORBIDDEN", "No tienes permisos para realizar esta acción", 403);
  }
  assertTransition(COMPLAINT_TRANSITIONS, complaint.status, to);

  await prismaClient.$transaction(async (tx) => {
    const updated = await tx.complaint.updateMany({
      where: { id, status: complaint.status },
      data: {
        status: to,
        ...(to === ComplaintStatus.RESOLVED && { resolvedAt: new Date() }),
        ...(to === ComplaintStatus.REOPENED && { resolvedAt: null }),
      },
    });
    assertStatusUpdated(updated.count);
    await tx.complaintEvent.create({
      data: { complaintId: id, fromStatus: complaint.status, toStatus: to, byUserId: actor.id },
    });
  });

  void publishToChannel(ABLY_CHANNELS.DASHBOARD_LIVE, "refresh", { reason: "complaint-updated", complaintId: id });
  return prismaClient.complaint.findUnique({ where: { id }, select: { id: true, status: true, resolvedAt: true, updatedAt: true } });
};

/**
 * Reapertura del residente: solo su propia queja, solo RESOLVED, solo dentro de
 * los 7 días. Deja el evento RESOLVED → REOPENED y devuelve la queja a revisión
 * (la administración la mueve a IN_REVIEW desde su bandeja).
 */
export const reopenComplaint = async (actor: ComplaintActor, id: number) => {
  await closeExpiredResolvedComplaints();

  const complaint = await prismaClient.complaint.findUnique({
    where: { id },
    select: { id: true, authorId: true, status: true, resolvedAt: true },
  });
  if (!complaint || !canSee(actor, complaint)) throw notFound();
  if (actor.canManage) {
    throw new AppError("FORBIDDEN", "Solo el residente puede reabrir su queja", 403);
  }
  if (complaint.status !== ComplaintStatus.RESOLVED || !complaint.resolvedAt) {
    throw new AppError("INVALID_TRANSITION", "Solo se puede reabrir una queja resuelta", 409);
  }
  if (Date.now() > complaint.resolvedAt.getTime() + REOPEN_WINDOW_MS) {
    throw new AppError(
      "REOPEN_WINDOW_EXPIRED",
      `El plazo de ${REOPEN_WINDOW_DAYS} días para reabrir la queja venció`,
      409,
    );
  }

  await prismaClient.$transaction(async (tx) => {
    const updated = await tx.complaint.updateMany({
      where: { id, status: ComplaintStatus.RESOLVED },
      data: { status: ComplaintStatus.REOPENED, resolvedAt: null },
    });
    assertStatusUpdated(updated.count);
    await tx.complaintEvent.create({
      data: { complaintId: id, fromStatus: ComplaintStatus.RESOLVED, toStatus: ComplaintStatus.REOPENED, byUserId: actor.id },
    });
  });

  void publishToChannel(ABLY_CHANNELS.DASHBOARD_LIVE, "refresh", { reason: "complaint-reopened", complaintId: id });
  return prismaClient.complaint.findUnique({ where: { id }, select: { id: true, status: true, resolvedAt: true, updatedAt: true } });
};
