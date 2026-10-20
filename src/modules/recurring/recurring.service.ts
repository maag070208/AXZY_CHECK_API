import { prismaClient } from "@src/core/config/database";
import { ITDataTableFetchParams, ITDataTableResponse } from "@src/core/dto/datatable.dto";
import { getPrismaPaginationParams } from "@src/core/utils/prisma-pagination.utils";

export const getDataTableRecurring = async (params: ITDataTableFetchParams): Promise<ITDataTableResponse<any>> => {
    const prismaParams = getPrismaPaginationParams(params);

    const [rows, total] = await Promise.all([
        prismaClient.recurringConfiguration.findMany({
            ...prismaParams,
            include: {
                recurringLocations: {
                    include: {
                        location: true,
                        tasks: true
                    }
                },
                guards: true
            }
        }),
        prismaClient.recurringConfiguration.count({
            where: prismaParams.where
        })
    ]);

    return { rows, total };
};

export const getAllRecurringConfigurations = async () => {
    return prismaClient.recurringConfiguration.findMany({
        orderBy: { updatedAt: 'desc' },
        include: {
            recurringLocations: {
                include: {
                    location: true,
                    tasks: true
                }
            },
            guards: true
        }
    });
};

export const getRecurringConfigById = async (id: number) => {
    return prismaClient.recurringConfiguration.findUnique({
        where: { id },
        include: {
            recurringLocations: {
                include: {
                    location: true,
                    tasks: true
                }
            }
        }
    });
};

interface ITaskCreate {
    description: string;
    reqPhoto: boolean;
}

interface ILocationCreate {
    locationId: number;
    tasks: ITaskCreate[];
}

export const createRecurringConfiguration = async (title: string, locations: ILocationCreate[], guardIds?: number[]) => {
    // If guardIds is provided, use it. Otherwise, fetch all guards (legacy behavior or default) ->
    // Actually, request says "por defecto estaran seleccionados todos", so the UI will send all IDs.
    // If we want to support "select all if empty", we can keep the logic, but better to rely on input.
    
    let guardsToConnect: { id: number }[] = [];

    if (guardIds && guardIds.length > 0) {
        guardsToConnect = guardIds.map(id => ({ id }));
    } else {
        // Fallback: Assign to ALL guards if none provided? Or none?
        // Let's keep the existing logic as a fallback for backward compatibility if needed, 
        // OR just assign none. given constraints, let's assign ALL if null/undefined to match previous behavior,
        // but if empty array is passed, it means "no guards".
        if (guardIds === undefined) { 
             const allGuards = await prismaClient.user.findMany({
                where: { active: true, role: { name: { in: ['GUARD', 'SHIFT', 'MAINT'] } } },
                select: { id: true }
            });
            guardsToConnect = allGuards.map(g => ({ id: g.id }));
        }
    }

    return prismaClient.recurringConfiguration.create({
        data: {
            title,
            active: true,
            guards: {
                connect: guardsToConnect
            },
            recurringLocations: {
                create: locations.map(loc => ({
                    locationId: loc.locationId,
                    active: true,
                    tasks: {
                        create: loc.tasks
                    }
                }))
            }
        },
        include: {
            recurringLocations: {
                include: {
                    location: true,
                    tasks: true
                }
            },
            guards: true
        }
    });
};

export const toggleRecurringConfiguration = async (id: number, active: boolean) => {
    return prismaClient.recurringConfiguration.update({
        where: { id },
        data: { active }
    });
};

export const deleteRecurringConfiguration = async (id: number) => {
    const config = await prismaClient.recurringConfiguration.findUnique({
        where: { id },
        include: { recurringLocations: { include: { tasks: true } } }
    });

    if (config) {
        for (const loc of config.recurringLocations) {
            await prismaClient.recurringTask.deleteMany({ where: { recurringLocationId: loc.id } });
            await prismaClient.recurringLocation.delete({ where: { id: loc.id } });
        }
        return prismaClient.recurringConfiguration.delete({ where: { id } });
    }
    return null;
};

export const assignConfigurationToGuards = async (configId: number, guardIds: number[]) => {
    return prismaClient.recurringConfiguration.update({
        where: { id: configId },
        data: {
            guards: {
                set: guardIds.map(id => ({ id }))
            }
        },
        include: { guards: true }
    });
};

export const updateRecurringConfiguration = async (id: number, title: string, locations: ILocationCreate[], guardIds?: number[]) => {
    // Transaction to ensure atomicity
    return prismaClient.$transaction(async (prisma) => {
        // 1. Update basic info
        const dataToUpdate: any = { title };
        
        // If guardIds is provided (even if empty array), update the list.
        if (guardIds !== undefined) {
            dataToUpdate.guards = {
                set: guardIds.map(gid => ({ id: gid }))
            };
        }

        await prisma.recurringConfiguration.update({
            where: { id },
            data: dataToUpdate
        });

        // 2. Delete existing locations (and tasks via cascade usually, but manual here to be safe)
        const existingLocs = await prisma.recurringLocation.findMany({ where: { configurationId: id } });
        for (const loc of existingLocs) {
            await prisma.recurringTask.deleteMany({ where: { recurringLocationId: loc.id } });
        }
        await prisma.recurringLocation.deleteMany({ where: { configurationId: id } });

        // 3. Create new locations
        for (const loc of locations) {
             await prisma.recurringLocation.create({
                 data: {
                     configurationId: id,
                     locationId: loc.locationId,
                     active: true,
                     tasks: {
                         create: loc.tasks
                     }
                 }
             });
        }

        return prisma.recurringConfiguration.findUnique({
            where: { id },
             include: {
                recurringLocations: {
                    include: {
                        location: true,
                        tasks: true
                    }
                },
                guards: true
            }
        });
    });
};

export const getRecurringConfigurationsForUser = async (userId: number) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const configs = await prismaClient.recurringConfiguration.findMany({
        where: {
            active: true,
            guards: {
                some: { id: userId }
            }
        },
        include: {
            recurringLocations: {
                include: {
                    location: true,
                    tasks: true
                }
            }
        }
    });

    // Check completion status relative to Active Round
    // If usage context: "Round Based", we should only count scans that happened AFTER the round started.
    // If no round active, we default to today (show history/completed).
    const activeRound = await prismaClient.round.findFirst({
        where: { guardId: userId, status: 'IN_PROGRESS' }
    });

    const filterDate = activeRound ? activeRound.startTime : today;

    // Una sola consulta para TODAS las ubicaciones del guardia (antes: una
    // consulta por punto, N+1 en cada apertura de la APP). Se toma el escaneo
    // más antiguo de cada ubicación dentro del periodo, de forma determinista.
    const locationIds = Array.from(
        new Set(configs.flatMap((c) => c.recurringLocations.map((l) => l.locationId))),
    );
    const scans = locationIds.length
        ? await prismaClient.kardex.findMany({
            where: {
                userId,
                locationId: { in: locationIds },
                timestamp: { gte: filterDate },
                // Solo escaneos completos (con notas), no borradores vacíos.
                notes: { not: '' },
            },
            select: { locationId: true, timestamp: true },
            orderBy: { timestamp: 'asc' },
        })
        : [];

    const firstScanByLocation = new Map<number, Date>();
    for (const scan of scans) {
        if (!firstScanByLocation.has(scan.locationId)) {
            firstScanByLocation.set(scan.locationId, scan.timestamp);
        }
    }

    return configs.map((config) => ({
        ...config,
        recurringLocations: config.recurringLocations.map((loc) => {
            const completedAt = firstScanByLocation.get(loc.locationId);
            return { ...loc, completed: !!completedAt, completedAt };
        }),
    }));
};
