
import { PrismaClient, AssignmentStatus } from "@prisma/client";
const prisma = new PrismaClient();

// Create a new assignment
export const createAssignment = async (data: {
  guardId: number;
  locationId: number;
  assignedBy: number;
  notes?: string;
  tasks?: { description: string; reqPhoto: boolean }[];
}) => {
  // Validate guard role
  const guard = await prisma.user.findUnique({
    where: { id: data.guardId },
  });

  if (!guard || guard.role !== "GUARD") {
    throw new Error("Invalid guard ID or user is not a GUARD");
  }

  // Duplicate Check: Guard + Location + Active Status
  const activeAssignment = await prisma.assignment.findFirst({
    where: {
      guardId: data.guardId,
      locationId: data.locationId,
      status: {
        in: [
          AssignmentStatus.PENDING,
          AssignmentStatus.CHECKING,
          AssignmentStatus.UNDER_REVIEW,
          AssignmentStatus.ANOMALY,
        ],
      },
    },
  });

  if (activeAssignment) {
    throw new Error("El guardia ya tiene una asignación activa para esta ubicación.");
  }

  return prisma.assignment.create({
    data: {
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
export const getAssignmentsByGuard = async (guardId: number) => {
  return prisma.assignment.findMany({
    where: { 
      guardId,
      status: {
        in: [AssignmentStatus.PENDING, AssignmentStatus.CHECKING, AssignmentStatus.UNDER_REVIEW, AssignmentStatus.ANOMALY]
      }
    },
    include: {
      location: true,
      tasks: true,
    },
    orderBy: { createdAt: "desc" },
  });
};

// Get all assignments (filtering optional)
export const getAllAssignments = async (filters: { guardId?: number; status?: AssignmentStatus; id?: number }) => {
  const where: any = {};
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
export const updateAssignmentStatus = async (id: number, status: AssignmentStatus) => {
    return prisma.assignment.update({
        where: { id },
        data: { status }
    });
}

// Toggle task completion
export const toggleAssignmentTask = async (taskId: number) => {
    const task = await prisma.assignmentTask.findUnique({ where: { id: taskId } });
    if (!task) throw new Error("Task not found");

    return prisma.assignmentTask.update({
        where: { id: taskId },
        data: { 
            completed: !task.completed,
            completedAt: !task.completed ? new Date() : null
        }
    });
}

