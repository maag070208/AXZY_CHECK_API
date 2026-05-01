
import { prismaClient } from "@src/core/config/database";
import { TResult } from '@src/core/dto/TResult';

const prisma = prismaClient;

export interface IGuardReportFilters {
    startDate: string;
    endDate: string;
    guardId?: number;
}

// Operational role names
const OPERATIONAL_ROLES = ['GUARD', 'SHIFT', 'MAINT'];

const getGuards = (guardId?: number) => {
    return prisma.user.findMany({
        where: {
            role: { name: { in: OPERATIONAL_ROLES } },
            active: true,
            softDelete: false,
            ...(guardId ? { id: guardId } : {})
        },
        select: { id: true, name: true, lastName: true, role: true }
    });
};

export const getGuardGeneralStats = async (filters: IGuardReportFilters): Promise<TResult<any>> => {
    try {
        const { startDate, endDate, guardId } = filters;
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);

        const [incidentCount, maintenanceCount, scans, rounds] = await Promise.all([
            prisma.incident.count({
                where: {
                    ...(guardId ? { guardId } : {}),
                    createdAt: { gte: start, lte: end }
                }
            }),
            prisma.maintenance.count({
                where: {
                    ...(guardId ? { guardId } : {}),
                    createdAt: { gte: start, lte: end }
                }
            }),
            prisma.kardex.count({
                where: {
                    ...(guardId ? { userId: guardId } : {}),
                    timestamp: { gte: start, lte: end }
                }
            }),
            prisma.round.findMany({
                where: {
                    ...(guardId ? { guardId } : {}),
                    startTime: { gte: start, lte: end }
                },
                include: {
                    recurringConfiguration: {
                        include: { recurringLocations: true }
                    }
                }
            })
        ]);

        const allKardex = await prisma.kardex.findMany({
            where: {
                ...(guardId ? { userId: guardId } : {}),
                timestamp: { gte: start, lte: end }
            },
            select: { userId: true, timestamp: true, locationId: true }
        });

        let missedScansCount = 0;
        let incompleteRoundsCount = 0;

        for (const round of rounds) {
            if (round.recurringConfiguration) {
                const roundEnd = round.endTime || new Date();
                const configLocationIds = round.recurringConfiguration.recurringLocations.map(rl => rl.locationId);
                
                const scannedCount = allKardex.filter(k => 
                    k.userId === round.guardId && 
                    k.timestamp >= round.startTime && 
                    k.timestamp <= roundEnd &&
                    configLocationIds.includes(k.locationId)
                ).length;
                
                const required = configLocationIds.length;
                const missedInThisRound = Math.max(0, required - scannedCount);
                missedScansCount += missedInThisRound;

                if (missedInThisRound > 0 && round.status === 'COMPLETED') {
                    incompleteRoundsCount++;
                }
            }
        }

        return {
            success: true,
            data: {
                totalIncidents: incidentCount + maintenanceCount,
                totalScans: scans,
                incompleteRounds: incompleteRoundsCount,
                missedScans: missedScansCount
            },
            messages: []
        };
    } catch (error: any) {
        return { success: false, data: null, messages: [error.message] };
    }
};

export const getTopPerformanceGuards = async (filters: IGuardReportFilters): Promise<TResult<any>> => {
    try {
        const { startDate, endDate } = filters;
        const start = new Date(startDate);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);

        const groupData = await prisma.kardex.groupBy({
            by: ['userId'],
            where: {
                timestamp: { gte: start, lte: end },
                user: { role: { name: { in: OPERATIONAL_ROLES } } }
            },
            _count: { _all: true },
            orderBy: { _count: { userId: 'desc' } },
            take: 5
        });

        const guardIds = groupData.map(g => g.userId);
        const guards = await prisma.user.findMany({
            where: { id: { in: guardIds } },
            select: { id: true, name: true, lastName: true }
        });

        const result = groupData.map(g => {
            const guard = guards.find(u => u.id === g.userId);
            return {
                guardId: g.userId,
                name: guard?.name || 'Unknown',
                lastName: guard?.lastName || '',
                totalScans: (g as any)._count._all || (g as any)._count.userId || 0
            };
        });

        return { success: true, data: result, messages: [] };
    } catch (error: any) {
        return { success: false, data: [], messages: [error.message] };
    }
};

export const getWorkloadComparison = async (filters: IGuardReportFilters): Promise<TResult<any>> => {
    try {
        const { startDate, endDate } = filters;
        const start = new Date(startDate);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);

        const guards = await getGuards();
        const guardIds = guards.map(g => g.id);

        const [scans, incidents, maintenances, rounds] = await Promise.all([
            prisma.kardex.groupBy({
                by: ['userId'],
                where: { userId: { in: guardIds }, timestamp: { gte: start, lte: end } },
                _count: { _all: true }
            }),
            prisma.incident.groupBy({
                by: ['guardId'],
                where: { guardId: { in: guardIds }, createdAt: { gte: start, lte: end } },
                _count: { _all: true }
            }),
            prisma.maintenance.groupBy({
                by: ['guardId'],
                where: { guardId: { in: guardIds }, createdAt: { gte: start, lte: end } },
                _count: { _all: true }
            }),
            prisma.round.groupBy({
                by: ['guardId'],
                where: { guardId: { in: guardIds }, startTime: { gte: start, lte: end } },
                _count: { _all: true }
            })
        ]);

        const result = guards.map(guard => {
            const scanCount = scans.find(s => s.userId === guard.id)?._count?._all || 0;
            const incCount = incidents.find(i => i.guardId === guard.id)?._count?._all || 0;
            const maintCount = maintenances.find(m => m.guardId === guard.id)?._count?._all || 0;
            const roundCount = rounds.find(r => r.guardId === guard.id)?._count?._all || 0;

            // Simple Workload Metric: Weighted sum of activities
            const workload = (scanCount * 1) + (incCount * 5) + (maintCount * 5) + (roundCount * 10);

            return {
                guardId: guard.id,
                name: guard.name,
                lastName: guard.lastName,
                role: guard.role?.value || '---',
                workload,
                details: { scans: scanCount, reports: incCount + maintCount, rounds: roundCount }
            };
        }).sort((a, b) => b.workload - a.workload);

        return { success: true, data: result, messages: [] };
    } catch (error: any) {
        return { success: false, data: [], messages: [error.message] };
    }
};

export const getActivityDistribution = async (filters: IGuardReportFilters): Promise<TResult<any>> => {
    return getGuardGeneralStats(filters);
};

export const getGuardDetailedReport = async (filters: IGuardReportFilters): Promise<TResult<any>> => {
    try {
        const { startDate, endDate, guardId } = filters;
        const start = new Date(startDate);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);

        const guards = await getGuards(guardId);
        const guardIds = guards.map(g => g.id);

        const [scansGroupBy, allRounds, allKardex] = await Promise.all([
            prisma.kardex.groupBy({
                by: ['userId'],
                where: { userId: { in: guardIds }, timestamp: { gte: start, lte: end } },
                _count: { _all: true }
            }),
            prisma.round.findMany({
                where: { guardId: { in: guardIds }, startTime: { gte: start, lte: end } },
                include: { recurringConfiguration: { include: { recurringLocations: true } } }
            }),
            prisma.kardex.findMany({
                where: { userId: { in: guardIds }, timestamp: { gte: start, lte: end } },
                select: { userId: true, timestamp: true, locationId: true }
            })
        ]);

        const reportData = guards.map(guard => {
            const guardRounds = allRounds.filter(r => r.guardId === guard.id);
            const guardScansCount = scansGroupBy.find(s => s.userId === guard.id)?._count?._all || 0;
            const guardKardex = allKardex.filter(k => k.userId === guard.id);

            let totalRoundDurationMs = 0;
            let completedRoundsCount = 0;
            let missedScansCount = 0;
            let incompleteRoundsCount = 0;

            for (const round of guardRounds) {
                if (round.status === 'COMPLETED' && round.endTime) {
                    totalRoundDurationMs += (round.endTime.getTime() - round.startTime.getTime());
                    completedRoundsCount++;
                }

                if (round.recurringConfiguration) {
                    const roundEnd = round.endTime || new Date();
                    const configIds = round.recurringConfiguration.recurringLocations.map(rl => rl.locationId);
                    
                    const scannedInRound = guardKardex.filter(k => 
                        k.timestamp >= round.startTime && 
                        k.timestamp <= roundEnd &&
                        configIds.includes(k.locationId)
                    ).length;

                    const required = configIds.length;
                    const missedInRound = Math.max(0, required - scannedInRound);
                    missedScansCount += missedInRound;

                    if (missedInRound > 0 && round.status === 'COMPLETED') {
                        incompleteRoundsCount++;
                    }
                }
            }

            const avgRoundTimeMinutes = completedRoundsCount > 0 
                ? (totalRoundDurationMs / completedRoundsCount) / (1000 * 60)
                : 0;

            return {
                guardId: guard.id,
                name: guard.name,
                lastName: guard.lastName,
                role: guard.role?.value || '---',
                totalRounds: guardRounds.length,
                totalScans: guardScansCount,
                incompleteRounds: incompleteRoundsCount,
                missedScans: missedScansCount,
                avgRoundTimeMinutes: Math.round(avgRoundTimeMinutes * 100) / 100
            };
        });

        return { success: true, data: reportData, messages: [] };
    } catch (error: any) {
        return { success: false, data: [], messages: [error.message] };
    }
};

export const getGuardDetailBreakdown = async (filters: IGuardReportFilters): Promise<TResult<any>> => {
    try {
        const { startDate, endDate, guardId } = filters;
        if (!guardId) throw new Error("GuardId is required");

        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);

        const [rounds, allKardex] = await Promise.all([
            prisma.round.findMany({
                where: { guardId, startTime: { gte: start, lte: end } },
                include: { recurringConfiguration: { include: { recurringLocations: { include: { location: true } } } } }
            }),
            prisma.kardex.findMany({
                where: { userId: guardId, timestamp: { gte: start, lte: end } },
                select: { locationId: true, timestamp: true }
            })
        ]);

        const missedPoints: any[] = [];
        const incompleteRounds: any[] = [];

        for (const round of rounds) {
            if (!round.recurringConfiguration) continue;

            const roundEnd = round.endTime || new Date();
            const scannedIds = new Set(
                allKardex
                    .filter(k => k.timestamp >= round.startTime && k.timestamp <= roundEnd)
                    .map(k => k.locationId)
            );

            const roundMissed = round.recurringConfiguration.recurringLocations.filter(rl => !scannedIds.has(rl.locationId));

            if (roundMissed.length > 0) {
                if (round.status === 'COMPLETED') {
                    incompleteRounds.push({
                        roundId: round.id,
                        startTime: round.startTime,
                        endTime: round.endTime,
                        missedCount: roundMissed.length,
                        totalLocations: round.recurringConfiguration.recurringLocations.length
                    });
                }

                roundMissed.forEach(rl => {
                    missedPoints.push({
                        roundId: round.id,
                        startTime: round.startTime,
                        locationId: rl.locationId,
                        locationName: rl.location.name,
                        aisle: rl.location.aisle
                    });
                });
            }
        }

        return { success: true, data: { missedPoints, incompleteRounds }, messages: [] };
    } catch (error: any) {
        return { success: false, data: null, messages: [error.message] };
    }
};
