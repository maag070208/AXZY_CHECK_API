import { Prisma } from "@prisma/client";
import { AppError } from "@src/core/errors/app-error";
import { prismaClient } from "@src/core/config/database";
import { ClientScope } from "@src/core/scope/client-scope";
import { invalidateSession } from "@src/modules/common/middlewares/auth.middleware";

/** Roles que se asignan a un cliente. MAINT es de la organización y no tiene asignación por cliente. */
const ASSIGNABLE_ROLES = ["GUARD", "SHIFT"] as const;

const ASSIGNMENT_SELECT = {
  id: true,
  guardId: true,
  clientId: true,
  startsAt: true,
  endsAt: true,
  guard: { select: { id: true, name: true, lastName: true, username: true } },
  client: { select: { id: true, name: true, type: true } },
} as const;

const organizationOf = (scope: ClientScope | undefined): number => {
  if (scope?.organizationId == null) {
    throw new AppError("ORGANIZATION_REQUIRED", "El usuario no tiene organización", 403);
  }
  return scope.organizationId;
};

export const listGuardAssignments = async (
  scope: ClientScope | undefined,
  filters: { clientId?: number; guardId?: number; active?: boolean },
) => {
  const organizationId = organizationOf(scope);
  const where: Prisma.GuardAssignmentWhereInput = { client: { organizationId } };
  if (filters.clientId) where.clientId = filters.clientId;
  if (filters.guardId) where.guardId = filters.guardId;
  if (filters.active === true) where.endsAt = null;
  else if (filters.active === false) where.endsAt = { not: null };

  return prismaClient.guardAssignment.findMany({
    where,
    select: ASSIGNMENT_SELECT,
    orderBy: [{ endsAt: "asc" }, { startsAt: "desc" }],
  });
};

export const getGuardAssignment = async (scope: ClientScope | undefined, id: number) => {
  const organizationId = organizationOf(scope);
  const assignment = await prismaClient.guardAssignment.findFirst({
    where: { id, client: { organizationId } },
    select: ASSIGNMENT_SELECT,
  });
  if (!assignment) throw new AppError("GUARD_ASSIGNMENT_NOT_FOUND", "Asignación no encontrada", 404);
  return assignment;
};

/**
 * Asigna un guardia a un cliente cerrando, en la misma transacción, su asignación abierta anterior.
 * El alcance del guardia se refresca al terminar (`invalidateSession`).
 */
export const createGuardAssignment = async (
  scope: ClientScope | undefined,
  input: { guardId: number; clientId: number; startsAt?: Date },
) => {
  const organizationId = organizationOf(scope);

  const client = await prismaClient.client.findFirst({
    where: { id: input.clientId, organizationId, active: true },
    select: { id: true },
  });
  if (!client) throw new AppError("CLIENT_INVALID", "El cliente no existe o no está activo en la organización", 400);

  const guard = await prismaClient.user.findFirst({
    where: {
      id: input.guardId,
      organizationId,
      softDelete: false,
      active: true,
      role: { name: { in: [...ASSIGNABLE_ROLES] } },
    },
    select: { id: true },
  });
  if (!guard) throw new AppError("ASSIGNEE_INVALID", "El usuario no es un guardia o jefe de turno de la organización", 400);

  const startsAt = input.startsAt ?? new Date();

  const created = await prismaClient.$transaction(async (tx) => {
    const open = await tx.guardAssignment.findFirst({
      where: { guardId: input.guardId, endsAt: null },
      select: { id: true, clientId: true, startsAt: true },
    });
    if (open?.clientId === input.clientId) {
      throw new AppError("GUARD_ASSIGNMENT_DUPLICATE", "El guardia ya está asignado a ese cliente", 409);
    }
    if (open) {
      // La asignación anterior termina ahora (o al arrancar la nueva); el CHECK exige fin > inicio.
      const now = new Date();
      const endsAt = new Date(Math.max(now.getTime(), open.startsAt.getTime() + 1000));
      await tx.guardAssignment.update({ where: { id: open.id }, data: { endsAt } });
    }
    return tx.guardAssignment.create({
      data: { guardId: input.guardId, clientId: input.clientId, startsAt },
      select: ASSIGNMENT_SELECT,
    });
  });

  invalidateSession(input.guardId);
  return created;
};

/** Termina la asignación abierta y refresca el alcance del guardia. */
export const endGuardAssignment = async (scope: ClientScope | undefined, id: number) => {
  const organizationId = organizationOf(scope);
  const current = await prismaClient.guardAssignment.findFirst({
    where: { id, client: { organizationId } },
    select: { id: true, guardId: true, startsAt: true, endsAt: true },
  });
  if (!current) throw new AppError("GUARD_ASSIGNMENT_NOT_FOUND", "Asignación no encontrada", 404);
  if (current.endsAt) throw new AppError("GUARD_ASSIGNMENT_CLOSED", "La asignación ya está terminada", 400);

  const now = new Date();
  const endsAt = new Date(Math.max(now.getTime(), current.startsAt.getTime() + 1000));
  const updated = await prismaClient.guardAssignment.update({
    where: { id },
    data: { endsAt },
    select: ASSIGNMENT_SELECT,
  });
  invalidateSession(current.guardId);
  return updated;
};
