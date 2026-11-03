
import { prismaClient } from "@src/core/config/database";
import { AssignmentStatus } from "@prisma/client";
import { AppError } from "@src/core/errors/app-error";
import { roleHasPermission } from "@src/core/permissions/permissions.service";
import { ITDataTableFetchParams, ITDataTableResponse } from "@src/core/dto/datatable.dto";
import { ASSIGNMENT_TRANSITIONS, assertStatusUpdated, assertTransition } from "@src/core/transitions/transitions";
import { getPrismaPaginationParams } from "@src/core/utils/prisma-pagination.utils";
import { isCompletedScan } from "@src/modules/recurring/recurring.service";
import { ClientScope, scopeByClient } from "@src/core/scope/client-scope";
import { operativeStaffWhere } from "@src/core/scope/membership";

const prisma = prismaClient;

/** Asignación abierta: todavía no la cierra un supervisor. */
const ACTIVE_STATUSES = [
  AssignmentStatus.PENDING,
  AssignmentStatus.CHECKING,
  AssignmentStatus.UNDER_REVIEW,
  AssignmentStatus.ANOMALY,
];

export const getDataTableAssignments = async (params: ITDataTableFetchParams, scope: ClientScope | undefined): Promise<ITDataTableResponse<any>> => {
  const prismaParams = getPrismaPaginationParams(params);
  prismaParams.where = { ...prismaParams.where, ...scopeByClient(scope) };

  const [rows, total] = await Promise.all([
    prisma.assignment.findMany({
      ...prismaParams,
      include: {
        location: true,
        guard: { select: { id: true, name: true, lastName: true } },
        tasks: true,
      }
    }),
    prisma.assignment.count({
      where: prismaParams.where
    })
  ]);

  return { rows, total };
};

// Create a new assignment
export const createAssignment = async (data: {
  guardId: number;
  locationId: number;
  assignedBy: number;
  notes?: string;
  tasks?: { description: string; reqPhoto: boolean }[];
}, scope: ClientScope | undefined) => {
  const { clientId } = scopeByClient(scope);
  // Personal operativo del mismo cliente (guardia, jefe de turno o mantenimiento de la organización).
  const guard = await prisma.user.findFirst({
    where: { id: data.guardId, ...operativeStaffWhere(scope) },
    select: { id: true },
  });

  if (!guard) {
    throw new AppError("ASSIGNEE_INVALID", "El usuario indicado no existe o no es personal operativo (guardia, jefe de turno o mantenimiento)", 400);
  }

  // Duplicate Check: Guard + Location + Active Status
  const activeAssignment = await prisma.assignment.findFirst({
    where: {
      guardId: data.guardId,
      locationId: data.locationId,
      status: { in: ACTIVE_STATUSES },
    },
  });

  if (activeAssignment) {
    throw new AppError("ASSIGNMENT_DUPLICATE", "El guardia ya tiene una asignación activa para esta ubicación.", 409);
  }

  const location = await prisma.location.findFirst({ where: { id: data.locationId, softDelete: false, clientId }, select: { id: true } });
  if (!location) {
    throw new AppError("LOCATION_NOT_FOUND", "Ubicación no encontrada", 404);
  }

  return prisma.assignment.create({
    data: {
      clientId,
      guardId: data.guardId,
      locationId: data.locationId,
      assignedBy: data.assignedBy,
      notes: data.notes,
      status: AssignmentStatus.PENDING,
      tasks: {
        create: data.tasks?.map((t) => ({
          description: t.description,
          reqPhoto: t.reqPhoto,
        })),
      },
    },
    include: {
      location: true,
      guard: {
        select: { id: true, name: true, lastName: true },
      },
      kardex: true,
      tasks: true,
    },
  });
};

// Get assignments for a specific guard (My Assignments)
export const getAssignmentsByGuard = async (guardId: number, scope: ClientScope | undefined) => {
  const assignments = await prisma.assignment.findMany({
    where: { guardId, status: { in: ACTIVE_STATUSES }, ...scopeByClient(scope) },
    include: {
      location: true,
      tasks: true,
      kardex: { select: { notes: true, media: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  // CHECKING nace con el borrador del escaneo: `delivered` distingue un reporte terminado de uno a medias.
  return assignments.map(({ kardex, ...assignment }) => ({
    ...assignment,
    delivered: kardex.some(isCompletedScan),
  }));
};

// Get all assignments (filtering optional)
export const getAllAssignments = async (filters: { guardId?: number; status?: AssignmentStatus; id?: number }, scope: ClientScope | undefined) => {
  const where: any = { ...scopeByClient(scope) };
  if (filters.id) where.id = filters.id;
  if (filters.guardId) where.guardId = filters.guardId;
  if (filters.status) where.status = filters.status;

  return prisma.assignment.findMany({
    where,
    include: {
        location: true,
        guard: { select: { id: true, name: true, lastName: true } },
        tasks: true,
        kardex: {
          include: {
            location: true,
            user: { select: { id: true, name: true, lastName: true, username: true, role: true } },
            assignment: true
          }
        }
    },
    orderBy: { createdAt: 'desc' }
  });
};

// Update status
export const updateAssignmentStatus = async (id: number, status: AssignmentStatus, scope: ClientScope | undefined) => {
    const current = await prisma.assignment.findFirst({ where: { id, ...scopeByClient(scope) }, select: { status: true } });
    if (!current) throw new AppError("ASSIGNMENT_NOT_FOUND", "Asignación no encontrada", 404);
    assertTransition(ASSIGNMENT_TRANSITIONS, current.status, status);

    const { count } = await prisma.assignment.updateMany({ where: { id, status: current.status }, data: { status } });
    assertStatusUpdated(count);

    return prisma.assignment.findUniqueOrThrow({ where: { id } });
}

// Toggle task completion
/** Con `completed` fija el valor: un reintento offline no debe volver a invertir la tarea. */
export const toggleAssignmentTask = async (taskId: number, actor: { id: number; role: string }, completed: boolean | undefined, scope: ClientScope | undefined) => {
    const { clientId } = scopeByClient(scope);
    const task = await prisma.assignmentTask.findUnique({ where: { id: taskId }, include: { assignment: { select: { guardId: true, clientId: true } } } });
    // De otro cliente es "no encontrada".
    if (!task || task.assignment.clientId !== clientId) throw new AppError("TASK_NOT_FOUND", "Tarea no encontrada", 404);
    // Cada guardia completa solo las tareas de SUS asignaciones; la supervisión puede con todas.
    if (task.assignment.guardId !== Number(actor.id) && !(await roleHasPermission(actor.role, "assignments.manage"))) {
        throw new AppError("FORBIDDEN", "No tienes permisos para realizar esta acción", 403);
    }

    const next = completed ?? !task.completed;
    return prisma.assignmentTask.update({
        where: { id: taskId },
        data: {
            completed: next,
            completedAt: next ? (task.completedAt ?? new Date()) : null
        }
    });
}

