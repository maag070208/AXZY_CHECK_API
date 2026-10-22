
import { USER_PUBLIC_SELECT } from "@src/core/constants/user-select";
import { Prisma } from "@prisma/client";
import { prismaClient } from "@src/core/config/database";
import { logger } from "@src/core/logger/logger";
import { TResult } from '@src/core/dto/TResult';
import { ITDataTableFetchParams, ITDataTableResponse } from "@src/core/dto/datatable.dto";
import { getPrismaPaginationParams } from "@src/core/utils/prisma-pagination.utils";
import { ABLY_CHANNELS, publishToChannel } from "@src/core/config/ably";

const prisma = prismaClient;

/** El detalle del fallo va al log del servidor; al cliente solo un mensaje genérico (E-19). */
const logFailure = (error: any) => logger.error({ err: { name: error?.name, message: error?.message } }, 'error en rondas');

export const getDataTableRounds = async (params: ITDataTableFetchParams): Promise<ITDataTableResponse<any>> => {
    // Extract custom frontend-only filters
    const customFilters = params.filters || {};
    
    // Clean filters for generic Prisma mapping
    const cleanFilters: any = {};
    if (params.filters) {
        for (const [key, value] of Object.entries(params.filters)) {
            if (key !== 'refreshKey' && key !== 'date') {
                if (key === 'guard') {
                    // Map the UI column "guard" to Prisma "guardId"
                    cleanFilters['guardId'] = Number(value);
                } else if (key === 'recurringConfiguration') {
                    cleanFilters['recurringConfigurationId'] = Number(value);
                } else if (key === 'search') {
                    cleanFilters.guard = {
                        OR: [
                            { name: { contains: String(value), mode: 'insensitive' } },
                            { lastName: { contains: String(value), mode: 'insensitive' } },
                            { username: { contains: String(value), mode: 'insensitive' } },
                        ]
                    };
                } else {
                    cleanFilters[key] = value;
                }
            }
        }
    }

    const prismaParams = getPrismaPaginationParams({ ...params, filters: cleanFilters });

    // Map `date` to actual startTime range filter
    if (customFilters.date) {
        const dateParams = Array.isArray(customFilters.date) ? customFilters.date : [customFilters.date, customFilters.date];
        const start = new Date(dateParams[0]);
        const end = new Date(dateParams[1] || dateParams[0]);
        
        if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
            prismaParams.where.startTime = {
                gte: start,
                lte: end
            };
        }
    }

    const [rows, total] = await Promise.all([
        prisma.round.findMany({
            ...prismaParams,
            include: {
                guard: {
                    select: { id: true, name: true, lastName: true }
                },
                recurringConfiguration: {
                    include: {
                        recurringLocations: { where: { active: true } }
                    }
                }
            },
            orderBy: prismaParams.orderBy || { startTime: 'desc' }
        }),
        prisma.round.count({
            where: prismaParams.where
        })
    ]);

    const rowsWithProgress = await attachRoundProgress(rows);

    return { rows: rowsWithProgress, total };
};

/**
 * "Avance" y "Desempeño" en el Historial de Recorridos: cuántos puntos de
 * la ruta escaneó el guardia en cada ronda (terminada o en curso) y un
 * status MALO/MEDIO/ALTO/EXCELENTE según qué tanto de la ruta cubrió —
 * igual de útil en rondas ya finalizadas (¿la terminó de verdad o solo la
 * cerró?) que en las que siguen en curso.
 */
const PROGRESS_STATUS_THRESHOLDS = { medio: 1 / 3, alto: 2 / 3 };

const progressStatusFor = (percent: number | null): "MALO" | "MEDIO" | "ALTO" | "EXCELENTE" | null => {
    if (percent === null) return null;
    if (percent >= 100) return "EXCELENTE";
    if (percent >= PROGRESS_STATUS_THRESHOLDS.alto * 100) return "ALTO";
    if (percent >= PROGRESS_STATUS_THRESHOLDS.medio * 100) return "MEDIO";
    return "MALO";
};

const attachRoundProgress = async (rows: any[]) => {
    if (rows.length === 0) return rows;

    // Puntos distintos escaneados por el guardia dentro de cada ronda, calculados
    // en la base de datos con una sola consulta agrupada (antes se traían todos
    // los escaneos de los guardias a memoria, E-03).
    const now = new Date();
    const ids = rows.map((r: any) => r.id);
    const counts = await prisma.$queryRaw<{ roundId: number; scanned: number }[]>`
        SELECT r."id" AS "roundId", COUNT(DISTINCT k."locationId")::int AS "scanned"
        FROM "Round" r
        LEFT JOIN "Kardex" k
          ON k."userId" = r."guardId"
         AND k."timestamp" >= r."startTime"
         AND k."timestamp" <= COALESCE(r."endTime", ${now})
         AND k."media" IS NOT NULL
         AND CASE
               WHEN jsonb_typeof(k."media") = 'array'
               THEN jsonb_array_length(k."media") > 0
               ELSE FALSE
             END
        WHERE r."id" IN (${Prisma.join(ids)})
        GROUP BY r."id"
    `;
    const scannedById = new Map(counts.map((c) => [Number(c.roundId), Number(c.scanned)]));

    return rows.map((round: any) => {
        const totalLocations = round.recurringConfiguration?.recurringLocations?.length ?? null;
        const scannedCount = scannedById.get(round.id) ?? 0;
        const progressPercent =
            totalLocations && totalLocations > 0
                ? Math.min(100, Math.round((scannedCount / totalLocations) * 100))
                : null;

        return {
            ...round,
            scannedCount,
            totalLocations,
            progressPercent,
            progressStatus: progressStatusFor(progressPercent),
        };
    });
};

export const startRound = async (
  guardId: number,
  recurringConfigId?: number,
  options?: { clientRef?: string; startedAt?: Date; createdOffline?: boolean; syncedAt?: Date },
): Promise<TResult<any>> => {
  try {
    if (options?.clientRef) {
      const existing = await prisma.round.findUnique({
        where: { clientRef: options.clientRef },
        include: { guard: { select: USER_PUBLIC_SELECT }, recurringConfiguration: true },
      });
      if (existing) {
        if (existing.guardId !== guardId) {
          return { success: false, data: null, messages: ['La clave de sincronización pertenece a otra ronda.'] };
        }
        return { success: true, messages: ['Ronda ya sincronizada'], data: existing };
      }
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // 0. Get Guard info
    const guard = await prisma.user.findUnique({
        where: { id: guardId },
        include: { recurringConfigurations: true }
    });

    if (!guard) {
        return { success: false, data: null, messages: ['Guardia no encontrado'] };
    }

    // 1. STRICT REQUIREMENT: Only 1 active round per guard
    let activeRound = await prisma.round.findFirst({
        where: {
            guardId,
            status: 'IN_PROGRESS'
        },
        include: { guard: { select: USER_PUBLIC_SELECT }, recurringConfiguration: true }
    });

    if (activeRound) {
        // Validation: Check if the active round is "stale" or from a previous shift/schedule
        // Heuristic 1: Duration > 14 hours (Safe max shift length)
        const now = new Date();
        const durationHours = (now.getTime() - activeRound.startTime.getTime()) / (1000 * 60 * 60);
        
        // Heuristic 2: Switching Routes (If user explicitly selected a DIFFERENT route)
        // If we have an active round for Route A, and are starting Route B, we should probably close A.
        const isDifferentRoute = recurringConfigId && activeRound.recurringConfigurationId !== recurringConfigId;

        if (durationHours > 14 || isDifferentRoute) {
            // Auto-Close Stale/Different Round
            await prisma.round.update({
                where: { id: activeRound.id },
                data: { 
                    status: 'COMPLETED', 
                    endTime: new Date() 
                }
            });
            // Reset activeRound so we can create a new one below
            activeRound = null; 
        } else {
             // It's a recent, same-route round. Block creation.
             return {
                success: false,
                messages: [`Ya tienes una ronda activa: ${activeRound.recurringConfiguration?.title || 'Sin Ruta'}. Termínala antes de iniciar otra.`],
                data: activeRound,
            };
        }
    }

    // 2. Validate Recurring Config (Route)
    // If recurringConfigId is provided, check if it's assigned to the guard
    if (recurringConfigId) {
        const isAssigned = guard.recurringConfigurations.some(rc => rc.id === recurringConfigId);
        if (!isAssigned) {
             // Fallback: check if it's assigned via global query just in case, but usually user.recurringConfigurations is enough if loaded
             // Actually `include: { recurringConfigurations: true }` fetches the relation.
             return { success: false, messages: ['No tienes asignada esta ruta o no existe.'], data: null };
        }
    } else {
        // If NO config provided, we have a dilemma as per user request.
        // "Ningun guardia puede tener mas de 1 RUTA activa. Al darle al boton... mostrarle cual ruta quiere iniciar"
        // This implies they MUST select a route if they have options.
        // If they have only 1 assignment, maybe auto-select?
        // If they have 0, maybe allow generic round?
        
        if (guard.recurringConfigurations.length === 1) {
            recurringConfigId = guard.recurringConfigurations[0].id;
        } else if (guard.recurringConfigurations.length > 1) {
             return { success: false, messages: ['Debes especificar qué ruta deseas iniciar.'], data: null }; // Frontend handles selection
        }
        // If 0, proceed as generic round (legacy support)
    }

    // 4. CHECK RE-ENTRY Rule (Cooldown)
    // "Guard finishes round -> Wait 2 hours -> Can start again"
    // AND "Provided it is not taken by another guard" (This is handled by logic that might need to be added if rounds are shared, 
    // but assuming for now specific assignments just need cooldown).
    
    // Check if THIS route (recurringConfigId) is currently Active by ANYONE else
    if (recurringConfigId) {
        const routeActiveByOther = await prisma.round.findFirst({
            where: {
                recurringConfigurationId: recurringConfigId,
                status: 'IN_PROGRESS',
                guardId: { not: guardId } // Someone else
            },
            include: { guard: { select: USER_PUBLIC_SELECT } }
        });
        
        if (routeActiveByOther) {
             return {
                success: false,
                messages: [`Esta ruta ya está siendo recorrida por ${routeActiveByOther.guard.name}.`],
                data: null
            };
        }
    }

    // 4. CHECK RE-ENTRY Rule (Cooldown) - REMOVED AS PER REQUEST

    // 3. Create new Round (Existing logic matches)
    const newRound = await prisma.round.create({
      data: {
        guardId,
        status: 'IN_PROGRESS',
        startTime: options?.startedAt ?? new Date(),
        recurringConfigurationId: recurringConfigId,
        clientRef: options?.clientRef,
        createdOffline: options?.createdOffline ?? false,
        syncedAt: options?.syncedAt,
      },
      include: { guard: { select: USER_PUBLIC_SELECT }, recurringConfiguration: true }
    });

    // Live dashboard (Home de WEB): avisa a los clientes que vuelvan a
    // pedir /dashboard/live. Nunca bloquea ni puede romper esta respuesta.
    publishToChannel(ABLY_CHANNELS.DASHBOARD_LIVE, 'refresh', { reason: 'round-started', roundId: newRound.id });

    return {
      success: true,
      messages: ['Ronda iniciada correctamente'],
      data: newRound,
    };
  } catch (error: any) {
      logFailure(error);
    if (error?.code === 'P2002') {
      return {
        success: false,
        data: null,
        messages: ['Ya tienes una ronda activa. Termínala antes de iniciar otra.'],
      };
    }
    return {
      success: false,
      data: null,
      messages: ['Error al iniciar la ronda'],
    };
  }
};

/** Roles que pueden cerrar la ronda de otro guardia (supervisión). */
const ROUND_SUPERVISORS = ["ADMIN", "SHIFT"];

/**
 * Cierra una ronda. Solo puede hacerlo el guardia dueño o un supervisor
 * (ADMIN/SHIFT). Antes cualquier usuario autenticado podía cerrar la ronda de otro.
 */
export const endRound = async (
  roundId: number,
  actor?: { id: number; role: string },
  endedAt?: Date,
  idempotent = false,
): Promise<TResult<any>> => {
  try {
    const round = await prisma.round.findUnique({
      where: { id: roundId },
    });

    if (!round) {
      return { success: false, data: null, messages: ['Ronda no encontrada'] };
    }

    const isOwner = actor !== undefined && Number(actor.id) === round.guardId;
    const isSupervisor = actor !== undefined && ROUND_SUPERVISORS.includes(actor.role);
    if (actor && !isOwner && !isSupervisor) {
      return {
        success: false,
        data: null,
        messages: ['No puedes finalizar una ronda que no es tuya'],
        code: 'FORBIDDEN',
      } as any;
    }

    if (round.status === 'COMPLETED') {
        if (idempotent) {
            // Reintento offline: la ronda ya está en el estado deseado.
            return { success: true, messages: ['Ronda ya finalizada'], data: round };
        }
        return { success: false, data: null, messages: ['Esta ronda ya ha finalizado'] };
    }

    const updatedRound = await prisma.round.update({
      where: { id: roundId },
      data: {
        status: 'COMPLETED',
        endTime: endedAt ?? new Date(),
      },
    });

    publishToChannel(ABLY_CHANNELS.DASHBOARD_LIVE, 'refresh', { reason: 'round-ended', roundId: updatedRound.id });

    return {
      success: true,
      messages: ['Ronda finalizada correctamente'],
      data: updatedRound,
    };
  } catch (error: any) {
      logFailure(error);
    return {
      success: false,
      data: null,
      messages: ['Error al finalizar la ronda'],
    };
  }
};

export const getCurrentRound = async (guardId: number): Promise<TResult<any>> => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        // Fetch the LATEST round for THIS GUARD for TODAY (Active OR Completed)
        let round = await prisma.round.findFirst({
            where: {
                guardId, // Added filter
                startTime: {
                    gte: today, // Only from today? 
                    // Actually, if we want to catch "stale" rounds from Yesterday that are still active,
                    // we should probably NOT filter by 'today' strictly for the "IN_PROGRESS" check.
                    // But legacy logic filters today. 
                    // Let's widen the search for IN_PROGRESS items to catch stale ones.
                },
            },
            include: {
                guard: { select: USER_PUBLIC_SELECT },
                recurringConfiguration: true
            },
            orderBy: {
                startTime: 'desc'
            }
        });
        
        // If we didn't find one today, let's check if there is ANY active round (even yesterday's) to auto-close
        if (!round) {
             const anyActive = await prisma.round.findFirst({
                 where: { guardId, status: 'IN_PROGRESS' },
                 include: { guard: { select: USER_PUBLIC_SELECT }, recurringConfiguration: true },
                 orderBy: { startTime: 'desc' }
             });
             if (anyActive) round = anyActive;
        }

        if (!round) {
            return { success: true, data: null, messages: ['No hay ronda activa hoy'] };
        }
        
        // Check Stale in getCurrentRound too
        if (round.status === 'IN_PROGRESS') {
             const now = new Date();
             const durationHours = (now.getTime() - round.startTime.getTime()) / (1000 * 60 * 60);
             if (durationHours > 14) {
                 // Auto-close logic
                 await prisma.round.update({
                    where: { id: round.id },
                    data: { status: 'COMPLETED', endTime: new Date() }
                 });
                 // Return null as if no round is active
                 return { success: true, data: null, messages: ['Ronda anterior cerrada por tiempo'] };
             }
        }

        return { success: true, data: round, messages: [] };
    } catch (error: any) {
        logFailure(error);
        return { success: false, data: null, messages: ['Error al obtener la ronda actual'] };
    }
};

export const getRounds = async (dateStr?: string, guardId?: number): Promise<TResult<any>> => {
    try {
        let dateFilter: any = {};
        if (dateStr) {
            const start = new Date(dateStr);
            start.setHours(0, 0, 0, 0);
            
            // Extend window to cover timezone differences (e.g. UTC-6 late rounds are "next day" in UTC)
            // We search from [Selected Day 00:00 UTC] to [Next Day 12:00 UTC]
            // This ensures we catch late shifts that are technically "tomorrow" in UTC but "today" locally.
            const end = new Date(start);
            end.setDate(end.getDate() + 1);
            end.setHours(12, 0, 0, 0); 

            dateFilter = {
                startTime: {
                    gte: start,
                    lt: end
                }
            };
        }

        const where: any = { ...dateFilter };
        if (guardId) {
            where.guardId = guardId;
        }

        const rounds = await prisma.round.findMany({
            where,
            include: {
                guard: {
                    select: { id: true, name: true, lastName: true }
                },
                recurringConfiguration: true
            },
            orderBy: {
                startTime: 'desc'
            }
        });

        return { success: true, data: rounds, messages: [] };

    } catch (error: any) {

        logFailure(error);
        return { success: false, data: null, messages: ['Error al obtener Historial de recorridos'] };
    }
};

export const getRoundDetail = async (roundId: number): Promise<TResult<any>> => {
    try {
        const round = await prisma.round.findUnique({
            where: { id: roundId },
            include: {
                guard: {
                    select: { id: true, name: true, lastName: true }
                },
                recurringConfiguration: {
                    include: {
                        recurringLocations: {
                            include: {
                                location: true
                            }
                        }
                    }
                }
            }
        });

        if (!round) {
            return { success: false, data: null, messages: ['Ronda no encontrada'] };
        }

        const start = round.startTime;
        const end = round.endTime || new Date();

        // 1. Fetch Scans (Kardex) in range AND by this Guard
        const scans = await prisma.kardex.findMany({
            where: {
                timestamp: { gte: start, lte: end },
                userId: round.guardId
            },
            include: {
                location: true,
                user: { select: { id: true, name: true, lastName: true } },
                assignment: {
                    include: {
                        tasks: true
                    }
                }
            },
            orderBy: { timestamp: 'asc' }
        });

        // 2. Last known GPS coordinate per expected location, so the map can
        //    still show gray pins for points that were not scanned this round.
        const expectedLocationIds = round.recurringConfiguration?.recurringLocations.map((rl) => rl.locationId) ?? [];
        const latestCoordinates = expectedLocationIds.length
            ? await prisma.kardex.findMany({
                where: {
                    locationId: { in: expectedLocationIds },
                    latitude: { not: null },
                    longitude: { not: null },
                },
                orderBy: { timestamp: "desc" },
                distinct: ["locationId"],
                select: { locationId: true, latitude: true, longitude: true },
            })
            : [];
        const coordinateByLocation = new Map(latestCoordinates.map((c) => [c.locationId, c]));
        const roundWithCoordinates = {
            ...round,
            recurringConfiguration: round.recurringConfiguration
                ? {
                    ...round.recurringConfiguration,
                    recurringLocations: round.recurringConfiguration.recurringLocations.map((rl) => ({
                        ...rl,
                        lastLatitude: coordinateByLocation.get(rl.locationId)?.latitude ?? null,
                        lastLongitude: coordinateByLocation.get(rl.locationId)?.longitude ?? null,
                    })),
                }
                : null,
        };

        // 3. Construct Timeline
        const timeline: any[] = [];

        // Add Start Event
        timeline.push({
            type: 'START',
            timestamp: round.startTime,
            description: 'Inicio de Ronda',
            guard: round.guard,
            data: round
        });

        // Add Scans
        scans.forEach(scan => {
            timeline.push({
                type: 'SCAN',
                timestamp: scan.timestamp,
                description: `Escaneo: ${scan.location.name}`,
                guard: scan.user,
                data: scan
            });
        });

        // Incidents insertion logic removed

        // Add End Event if completed
        if (round.endTime) {
            timeline.push({
                type: 'END',
                timestamp: round.endTime,
                description: 'Fin de Ronda',
                guard: round.guard, // Or whoever ended it? Round schema only has one guardId (initiator). 
                // Ideally we'd capture who ended it, but schema doesn't seem to have 'endedBy'. 
                // We'll assume the initiator for now or leaving guard undefined.
                data: round
            });
        }

        // Sort by timestamp
        timeline.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

        return {
            success: true,
            data: {
                round: roundWithCoordinates,
                timeline
            },
            messages: []
        };

    } catch (error: any) {

        logFailure(error);
        return { success: false, data: null, messages: ['Error al obtener detalle de ronda'] };
    }
};
