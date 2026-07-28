import { prismaClient } from "@src/core/config/database";
import { TResult } from '@src/core/dto/TResult';

const prisma = prismaClient;

export interface IDashboardMetrics {
  totalProperties: number;
  totalLocations: number;
  totalGuards: number;
  totalUsers: number;
  activeRounds: number;
  pendingIncidents: number;
  pendingMaintenance: number;
  activeAssignments: number;
  activeRoutes: number;
  recentActivity: {
    id: number;
    guardName: string;
    locationName: string;
    timestamp: Date;
    scanType: string;
  }[];
}

export interface ICompletedRoundToday {
  id: number;
  guardName: string;
  routeName: string;
  startTime: Date;
  endTime: Date | null;
  durationMinutes: number;
  totalLocations: number;
  scannedLocations: number;
  missedLocations: number;
}

export const getCompletedRoundsToday = async (): Promise<{ success: boolean; data: ICompletedRoundToday[] | null; messages: string[] }> => {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const rounds = await prismaClient.round.findMany({
      where: {
        status: 'COMPLETED',
        startTime: { gte: todayStart, lte: todayEnd }
      },
      select: {
        id: true,
        startTime: true,
        endTime: true,
        guard: { select: { id: true, name: true, lastName: true } },
        recurringConfiguration: {
          select: {
            title: true,
            recurringLocations: {
              select: { locationId: true }
            }
          }
        }
      },
      orderBy: { endTime: 'desc' }
    });

    const allKardex = await prismaClient.kardex.findMany({
      where: {
        timestamp: { gte: todayStart, lte: todayEnd }
      },
      select: { userId: true, locationId: true, timestamp: true }
    });

    const data = rounds.map(round => {
      const durationMs = round.endTime ? round.endTime.getTime() - round.startTime.getTime() : 0;
      const durationMinutes = Math.round(durationMs / 60000);
      const totalLocations = round.recurringConfiguration?.recurringLocations.length || 0;

      const roundEnd = round.endTime || new Date();
      const scannedLocations = allKardex.filter(k =>
        k.userId === round.guard.id &&
        k.timestamp >= round.startTime &&
        k.timestamp <= roundEnd
      ).length;

      const missedLocations = Math.max(0, totalLocations - scannedLocations);

      return {
        id: round.id,
        guardName: `${round.guard.name} ${round.guard.lastName || ''}`.trim(),
        routeName: round.recurringConfiguration?.title || 'Ronda General',
        startTime: round.startTime,
        endTime: round.endTime,
        durationMinutes,
        totalLocations,
        scannedLocations,
        missedLocations
      };
    });

    return { success: true, data, messages: [] };
  } catch (error: any) {
    return { success: false, data: null, messages: [error.message] };
  }
};

export const getDashboardMetrics = async (): Promise<{ success: boolean; data: IDashboardMetrics | null; messages: string[] }> => {
  try {
    const [
      totalProperties,
      totalLocations,
      totalGuards,
      totalUsers,
      activeRounds,
      pendingIncidents,
      pendingMaintenance,
      activeAssignments,
      activeRoutes,
      recentKardex
    ] = await Promise.all([
      prismaClient.property.count({ where: { active: true, softDelete: false } }),
      prismaClient.location.count({ where: { active: true, softDelete: false } }),
      prismaClient.user.count({
        where: {
          role: { name: { in: ['GUARD', 'SHIFT', 'MAINT'] } },
          active: true,
          softDelete: false
        }
      }),
      prismaClient.user.count({ where: { active: true, softDelete: false } }),
      prismaClient.round.count({ where: { status: 'IN_PROGRESS' } }),
      prismaClient.incident.count({ where: { status: 'PENDING' } }),
      prismaClient.maintenance.count({ where: { status: 'PENDING' } }),
      prismaClient.assignment.count({ where: { status: { in: ['PENDING', 'CHECKING'] } } }),
      prismaClient.recurringConfiguration.count({ where: { active: true } }),
      prismaClient.kardex.findMany({
        orderBy: { timestamp: 'desc' },
        take: 10,
        select: {
          id: true,
          timestamp: true,
          scanType: true,
          user: { select: { id: true, name: true, lastName: true } },
          location: { select: { id: true, name: true, aisle: true } }
        }
      })
    ]);

    return {
      success: true,
      data: {
        totalProperties,
        totalLocations,
        totalGuards,
        totalUsers,
        activeRounds,
        pendingIncidents,
        pendingMaintenance,
        activeAssignments,
        activeRoutes,
        recentActivity: recentKardex.map(k => ({
          id: k.id,
          guardName: `${k.user.name} ${k.user.lastName || ''}`.trim(),
          locationName: k.location.name,
          timestamp: k.timestamp,
          scanType: k.scanType
        }))
      },
      messages: []
    };
  } catch (error: any) {
    return { success: false, data: null, messages: [error.message] };
  }
};
