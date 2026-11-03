import { prismaClient } from "@src/core/config/database";
import { AppError } from "@src/core/errors/app-error";
import { ITDataTableFetchParams, ITDataTableResponse } from "@src/core/dto/datatable.dto";
import { getPrismaPaginationParams } from "@src/core/utils/prisma-pagination.utils";
import { ClientScope, scopeByClient } from "@src/core/scope/client-scope";
import { operativeStaffWhere } from "@src/core/scope/membership";

/** Un escaneo está completo con reporte guardado (notas) y al menos una evidencia. */
export const isCompletedScan = (scan: { notes: string | null; media: unknown }) =>
    !!scan.notes?.trim() && Array.isArray(scan.media) && scan.media.length > 0;

export const getDataTableRecurring = async (params: ITDataTableFetchParams, scope: ClientScope | undefined): Promise<ITDataTableResponse<any>> => {
    const prismaParams = getPrismaPaginationParams(params);
    prismaParams.where = { ...prismaParams.where, ...scopeByClient(scope) };

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

export const getAllRecurringConfigurations = async (scope: ClientScope | undefined) => {
    return prismaClient.recurringConfiguration.findMany({
        where: scopeByClient(scope),
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

export const getRecurringConfigById = async (id: number, scope: ClientScope | undefined) => {
    return prismaClient.recurringConfiguration.findFirst({
        where: { id, ...scopeByClient(scope) },
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

/** Una ruta solo se asigna a personal operativo existente y activo del cliente (no a residentes, ids inventados ni personal de otro cliente). */
const assertOperativeGuards = async (guardIds: number[], scope: ClientScope | undefined) => {
    const unique = [...new Set(guardIds)];
    if (unique.length === 0) return;
    const valid = await prismaClient.user.count({
        where: { id: { in: unique }, ...operativeStaffWhere(scope) }
    });
    if (valid !== unique.length) {
        throw new AppError("ROUTE_GUARDS_INVALID", "Algún usuario indicado no existe o no es personal operativo", 400);
    }
};

/** Los puntos de una ruta son ubicaciones del mismo cliente. */
const assertLocationsInScope = async (locations: { locationId: number }[], scope: ClientScope | undefined) => {
    const unique = [...new Set(locations.map((l) => l.locationId))];
    if (unique.length === 0) return;
    const valid = await prismaClient.location.count({ where: { id: { in: unique }, ...scopeByClient(scope) } });
    if (valid !== unique.length) {
        throw new AppError("ROUTE_LOCATIONS_INVALID", "Alguna ubicación indicada no existe", 400);
    }
};

/** Ruta del cliente del alcance; de otro cliente responde 404, igual que si no existiera. */
const assertConfigInScope = async (id: number, scope: ClientScope | undefined) => {
    const config = await prismaClient.recurringConfiguration.findFirst({ where: { id, ...scopeByClient(scope) }, select: { id: true } });
    if (!config) throw new AppError("ROUTE_NOT_FOUND", "Ruta no encontrada", 404);
};

interface ITaskCreate {
    description: string;
    reqPhoto: boolean;
}

interface ILocationCreate {
    locationId: number;
    tasks: ITaskCreate[];
}

export const createRecurringConfiguration = async (title: string, locations: ILocationCreate[], guardIds: number[] | undefined, scope: ClientScope | undefined) => {
    // If guardIds is provided, use it. Otherwise, fetch all guards (legacy behavior or default) ->
    // Actually, request says "por defecto estaran seleccionados todos", so the UI will send all IDs.
    // If we want to support "select all if empty", we can keep the logic, but better to rely on input.
    
    let guardsToConnect: { id: number }[] = [];
    await assertOperativeGuards(guardIds ?? [], scope);
    await assertLocationsInScope(locations, scope);

    if (guardIds && guardIds.length > 0) {
        guardsToConnect = guardIds.map(id => ({ id }));
    } else {
        // Fallback: Assign to ALL guards if none provided? Or none?
        // Let's keep the existing logic as a fallback for backward compatibility if needed, 
        // OR just assign none. given constraints, let's assign ALL if null/undefined to match previous behavior,
        // but if empty array is passed, it means "no guards".
        if (guardIds === undefined) { 
             const allGuards = await prismaClient.user.findMany({
                where: { active: true, ...operativeStaffWhere(scope) },
                select: { id: true }
            });
            guardsToConnect = allGuards.map(g => ({ id: g.id }));
        }
    }

    return prismaClient.recurringConfiguration.create({
        data: {
            ...scopeByClient(scope),
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

export const toggleRecurringConfiguration = async (id: number, active: boolean, scope: ClientScope | undefined) => {
    await assertConfigInScope(id, scope);
    return prismaClient.recurringConfiguration.update({
        where: { id },
        data: { active }
    });
};

export const deleteRecurringConfiguration = async (id: number, scope: ClientScope | undefined) => {
    await assertConfigInScope(id, scope);

    // Las rondas guardan a qué ruta pertenecen: borrarla dejaría el historial huérfano.
    if (await prismaClient.round.count({ where: { recurringConfigurationId: id } }) > 0) {
        throw new AppError("ROUTE_HAS_ROUNDS", "La ruta tiene rondas registradas y no puede eliminarse; desactívala", 409);
    }

    // Todo o nada: antes un fallo a la mitad dejaba la ruta sin sus puntos.
    return prismaClient.$transaction(async (tx) => {
        await tx.recurringTask.deleteMany({ where: { recurringLocation: { configurationId: id } } });
        await tx.recurringLocation.deleteMany({ where: { configurationId: id } });
        return tx.recurringConfiguration.delete({ where: { id } });
    });
};

export const assignConfigurationToGuards = async (configId: number, guardIds: number[], scope: ClientScope | undefined) => {
    await assertConfigInScope(configId, scope);
    await assertOperativeGuards(guardIds, scope);
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

export const updateRecurringConfiguration = async (id: number, title: string, locations: ILocationCreate[], guardIds: number[] | undefined, scope: ClientScope | undefined) => {
    await assertConfigInScope(id, scope);
    await assertOperativeGuards(guardIds ?? [], scope);
    await assertLocationsInScope(locations, scope);
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

export const getRecurringConfigurationsForUser = async (userId: number, scope: ClientScope | undefined) => {
    const { clientId } = scopeByClient(scope);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const configs = await prismaClient.recurringConfiguration.findMany({
        where: {
            active: true,
            clientId,
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
            },
            select: { locationId: true, timestamp: true, media: true, notes: true },
            orderBy: { timestamp: 'asc' },
        })
        : [];

    // COMPLETED requiere reporte guardado (notas) Y al menos una evidencia.
    // Si se guardó sin fotos/videos, o quedó en borrador, es NOT_COMPLETED.
    // Si luego se completa con evidencia, gana el escaneo completado más reciente.
    const scanState = new Map<
        number,
        { latest?: (typeof scans)[number]; completed?: (typeof scans)[number] }
    >();
    for (const scan of scans) {
        const entry = scanState.get(scan.locationId) ?? {};
        if (!entry.latest || scan.timestamp > entry.latest.timestamp) entry.latest = scan;
        if (isCompletedScan(scan) && (!entry.completed || scan.timestamp > entry.completed.timestamp)) {
            entry.completed = scan;
        }
        scanState.set(scan.locationId, entry);
    }

    return configs.map((config) => ({
        ...config,
        recurringLocations: config.recurringLocations.map((loc) => {
            const state = scanState.get(loc.locationId);
            const chosen = state?.completed ?? state?.latest;
            const isCompleted = !!state?.completed;
            const media = Array.isArray(chosen?.media) ? chosen.media : [];
            return {
                ...loc,
                completed: isCompleted,
                status: isCompleted ? 'COMPLETED' : chosen ? 'NOT_COMPLETED' : 'PENDING',
                completedAt: state?.completed?.timestamp ?? null,
                startedAt: chosen?.timestamp ?? null,
                reportSaved: !!chosen?.notes?.trim(),
                mediaCount: media.length,
            };
        }),
    }));
};
