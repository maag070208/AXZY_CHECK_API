import { prismaClient } from "@src/core/config/database";
import { AssignmentStatus, ScanType } from "@prisma/client";
import { ABLY_CHANNELS, publishToChannel } from "@src/core/config/ably";

// New Core Logic: Register Check with Automatic Classification
export const registerCheck = async (data: {
  userId: number;
  locationId: number;
  notes?: string;
  media?: any[];
  latitude?: number;
  longitude?: number;
  assignmentId?: number; // Optional manual override
  roundId?: number; // Id numérico de la ronda (si ya se conoce)
  roundClientRef?: string; // clientRef de la ronda (offline-first: la ronda pudo no tener id numérico aún)
  clientRef?: string; // Idempotency key generado en el cliente (offline-first)
  timestamp?: Date; // Hora original del evento en el dispositivo (offline-first)
}) => {
  // Idempotencia: si el clientRef ya fue registrado (reintento de sync
  // offline), regresamos el registro existente en vez de duplicarlo.
  if (data.clientRef) {
    const existing = await prismaClient.kardex.findUnique({
      where: { clientRef: data.clientRef },
    });
    if (existing) return existing;
  }

  // Resolver la ronda por clientRef si aún no tenemos su id numérico
  // (puede pasar si la ronda se inició offline y se sincronizó justo antes
  // que este escaneo, en el mismo lote).
  let finalRoundId = data.roundId;
  if (!finalRoundId && data.roundClientRef) {
    const round = await prismaClient.round.findUnique({ where: { clientRef: data.roundClientRef } });
    finalRoundId = round?.id;
  }

  let finalScanType: ScanType = ScanType.FREE;
  let finalAssignmentId = data.assignmentId;

  // 1. Check for Active Assignment (Highest Priority)
  // We check if there is a PENDING/CHECKING assignment for this user & location
  // If data.assignmentId is provided, we trust it, otherwise we try to find one.
  const activeAssignment = await prismaClient.assignment.findFirst({
        where: {
            guardId: data.userId,
            locationId: data.locationId,
            status: { in: [AssignmentStatus.PENDING, AssignmentStatus.CHECKING, AssignmentStatus.UNDER_REVIEW, AssignmentStatus.ANOMALY] }
        }
  });

  if (activeAssignment) {
      finalScanType = ScanType.ASSIGNMENT;
      finalAssignmentId = activeAssignment.id; // Link to the found assignment

      // Update Assignment status to CHECKING if it was PENDING
      if (activeAssignment.status === AssignmentStatus.PENDING) {
          await prismaClient.assignment.update({
              where: { id: activeAssignment.id },
              data: { status: AssignmentStatus.CHECKING }
          });
      }
  } else {
      // 2. Check for Recurring Location (Medium Priority)
      const isRecurring = await prismaClient.recurringLocation.findFirst({
          where: { locationId: data.locationId, active: true }
      });

      if (isRecurring) {
          finalScanType = ScanType.RECURRING;
          finalAssignmentId = undefined; // Ensure no assignment link for recurring
      } else {
          // 3. Fallback to FREE
          finalScanType = ScanType.FREE;
          finalAssignmentId = undefined;
      }
  }

  // Create the Kardex Record
  const created = await prismaClient.kardex.create({
    data: {
        userId: data.userId,
        locationId: data.locationId,
        notes: data.notes,
        media: data.media,
        latitude: data.latitude,
        longitude: data.longitude,
        assignmentId: finalAssignmentId,
        scanType: finalScanType,
        roundId: finalRoundId,
        clientRef: data.clientRef,
        timestamp: data.timestamp ?? undefined,
    },
  });

  // Live dashboard (Home de WEB): un nuevo escaneo puede mover el progreso
  // de una ronda activa o su "última ubicación" en el mapa.
  publishToChannel(ABLY_CHANNELS.DASHBOARD_LIVE, 'refresh', { reason: 'scan', kardexId: created.id });

  return created;
};

// Deprecated or Internal Use
export const createKardex = registerCheck;

export const updateKardex = async (
  id: number,
  data: {
    notes?: string;
    media?: any[];
    latitude?: number;
    longitude?: number;
  }
) => {
  return prismaClient.kardex.update({
    where: { id },
    data,
  });
};

export const getKardex = async (filters: {
  userId?: number;
  locationId?: number;
  startDate?: string;
  endDate?: string;
}) => {
  const where: any = {};

  if (filters.userId) where.userId = Number(filters.userId);
  if (filters.locationId) where.locationId = Number(filters.locationId);

  if (filters.startDate && filters.endDate) {
    where.timestamp = {
      gte: new Date(filters.startDate),
      lte: new Date(filters.endDate),
    };
  }

  return prismaClient.kardex.findMany({
    where,
    include: {
      user: {
        select: { id: true, name: true, lastName: true, username: true, role: true },
      },
      location: true,
      assignment: {
          include: {
              tasks: true
          }
      }
    },
    orderBy: {
      timestamp: "desc",
    },
  });
};

export const getKardexById = async (id: number) => {
  const kardex = await prismaClient.kardex.findUnique({
    where: { id },
    include: {
      user: {
        select: { id: true, name: true, lastName: true, username: true, role: true },
      },
      location: true,
      assignment: {
          include: {
              tasks: true
          }
      }
    },
  });

  // Fallback: If no assignment tasks, try to find recurring tasks for this location
  // This helps display tasks for incomplete recurring reports or history before text-persistence
  if (kardex && !kardex.assignment && kardex.scanType === 'RECURRING') {
      const recurringLoc = await prismaClient.recurringLocation.findFirst({
          where: { 
              locationId: kardex.locationId,
              active: true 
          },
          include: {
              tasks: true
          }
      });

      if (recurringLoc && recurringLoc.tasks.length > 0) {
          // Temporarily attach these tasks as if they were assignment tasks (read-only view)
          return {
              ...kardex,
              assignment: {
                  // Mock an assignment object structure for compatibility
                  id: 0, 
                  tasks: recurringLoc.tasks.map(t => ({
                      id: t.id,
                      description: t.description,
                      completed: false, // Default to false since we don't know
                      reqPhoto: t.reqPhoto
                  })),
                  status: 'PENDING'
              }
          };
      }
  }

  return kardex;
};

export const getDataTableKardex = async (params: {
  page: number;
  limit: number;
  filters: any;
  sort?: { key: string; order: 'asc' | 'desc' };
}) => {
  const { page, limit, filters, sort } = params;
  const skip = (page - 1) * limit;
  const take = limit;

  const where: any = {};

  if (filters.userId) {
    where.userId = Number(filters.userId);
  }

  if (filters.search) {
      where.user = {
          OR: [
              { name: { contains: filters.search, mode: 'insensitive' } },
              { lastName: { contains: filters.search, mode: 'insensitive' } },
              { username: { contains: filters.search, mode: 'insensitive' } },
          ]
      };
  }

  if (filters.date && Array.isArray(filters.date) && filters.date[0]) {
      const start = new Date(filters.date[0]);
      const end = filters.date[1] ? new Date(filters.date[1]) : new Date(start);
      
      if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
          where.timestamp = {
              gte: start,
              lte: end
          };
      }
  }

  const orderBy: any = {};
  if (sort && sort.key) {
    // Basic mapping for related fields if needed
    if (sort.key === 'user') {
        orderBy.user = { name: sort.order };
    } else if (sort.key === 'location') {
        orderBy.location = { name: sort.order };
    } else {
        orderBy[sort.key] = sort.order;
    }
  } else {
    orderBy.timestamp = 'desc';
  }

  const [rows, total] = await Promise.all([
    prismaClient.kardex.findMany({
      skip,
      take,
      where,
      include: {
        user: {
          select: { id: true, name: true, lastName: true, username: true, role: true },
        },
        location: true,
        assignment: true,
      },
      orderBy,
    }),
    prismaClient.kardex.count({ where }),
  ]);

  return {
    data: rows,
    total,
  };
};

export const deleteKardex = async (id: number) => {
    return prismaClient.kardex.delete({
        where: { id }
    });
};

export const updateKardexMedia = async (id: number, media: any[]) => {
    return prismaClient.kardex.update({
        where: { id },
        data: { media }
    });
};

/**
 * @description Anexa evidencia subida después de crear el registro (flujo
 * "guardar y subir después" para offline). Deduplica por `key`.
 */
export const appendKardexMedia = async (id: number, newMedia: any[]) => {
    const kardex = await prismaClient.kardex.findUnique({ where: { id } });
    if (!kardex) return null;

    const current: any[] = Array.isArray(kardex.media) ? (kardex.media as any[]) : [];
    const existingKeys = new Set(current.map((m: any) => m?.key).filter(Boolean));
    const merged = [
        ...current,
        ...newMedia.filter((m: any) => !m?.key || !existingKeys.has(m.key)),
    ];

    return prismaClient.kardex.update({
        where: { id },
        data: { media: merged },
    });
};
