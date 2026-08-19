import { prismaClient } from "@src/core/config/database";
import { comparePassword } from "@src/core/utils/security";
import { ITDataTableFetchParams, ITDataTableResponse } from "@src/core/dto/datatable.dto";
import { getPrismaPaginationParams } from "@src/core/utils/prisma-pagination.utils";
import { CreateShiftCheckInput } from "./shift-check.dto";
import { publishShiftIncident } from "../notifications/notifications.service";

/**
 * @description Convierte "HH:mm" (Schedule.startTime) a Date del día dado.
 * Si el formato es inválido, devuelve null.
 */
const parseScheduleTime = (shiftDate: Date, time: string): Date | null => {
    const match = /^([0-2]?\d):([0-5]\d)$/.exec(time);
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    const d = new Date(shiftDate);
    d.setHours(hours, minutes, 0, 0);
    return d;
};

/**
 * @description Calcula delayMinutes, isLate a partir de scheduledStartAt y actualEntryAt.
 * RF-02: marca retardo si la hora real supera la oficial.
 */
const computePuntuality = (
    scheduledStartAt: Date,
    actualEntryAt: Date | null,
): { delayMinutes: number; isLate: boolean } => {
    if (!actualEntryAt) return { delayMinutes: 0, isLate: false };
    const diffMs = actualEntryAt.getTime() - scheduledStartAt.getTime();
    const delayMinutes = Math.max(0, Math.round(diffMs / 60000));
    return { delayMinutes, isLate: delayMinutes > 0 };
};

/**
 * @description Genera Incidents automáticas a partir de un ShiftCheck
 * recién creado. RF-07/08/09.
 *  - Falta (isAbsent) → 1 Incident tipo SHIFT_FALTA.
 *  - Retardo (isLate) → 1 Incident tipo SHIFT_RETARDO (severidad según minutos).
 *  - Uniforme no cumplido → 1 Incident tipo SHIFT_UNIFORME por cada ítem fallido.
 *  - Handover faltante → 1 Incident tipo SHIFT_ENTREGA por cada ítem en `false`.
 * Devuelve los ids de los incidents creados.
 */
const generateIncidentsFromShiftCheck = async (
    shiftCheckId: string,
    data: CreateShiftCheckInput,
    actorId: number,
    delayMinutes: number,
): Promise<number[]> => {
    const createdIds: number[] = [];

    const findCategory = async (name: string) =>
        prismaClient.incidentCategory.findUnique({ where: { name } });

    const findType = async (name: string) =>
        prismaClient.incidentType.findUnique({ where: { name } });

    // 1. Falta (RF-07).
    if (data.isAbsent) {
        const cat = await findCategory("SHIFT_FALTA");
        const type = await findType("FALTA_INJUSTIFICADA");
        if (cat && type) {
            const inc = await prismaClient.incident.create({
                data: {
                    guardId: data.userId,
                    kind: "INCIDENT",
                    title: `Falta - ${data.shiftType}`,
                    description:
                        data.observations ??
                        `Falta registrada en la verificación de turno ${data.shiftType} del ${data.shiftDate}.`,
                    categoryId: cat.id,
                    typeId: type.id,
                    severity: "GRAVE",
                    createdAt: new Date(data.shiftDate),
                    replacedById: data.replacedById ?? undefined,
                    coverageStart: data.coverageStart ? new Date(data.coverageStart) : undefined,
                    coverageEnd: data.coverageEnd ? new Date(data.coverageEnd) : undefined,
                },
            });
            createdIds.push(inc.id);
        }
    }

    // 2. Retardo (RF-07).
    if (!data.isAbsent && delayMinutes > 0) {
        const cat = await findCategory("SHIFT_RETARDO");
        const typeName = delayMinutes >= 15 ? "RETARDO_GRAVE" : "RETARDO_LEVE";
        const type = await findType(typeName);
        if (cat && type) {
            const inc = await prismaClient.incident.create({
                data: {
                    guardId: data.userId,
                    kind: "INCIDENT",
                    title: `Retardo ${delayMinutes} min - ${data.shiftType}`,
                    description: data.observations ?? `Retardo de ${delayMinutes} minutos.`,
                    categoryId: cat.id,
                    typeId: type.id,
                    severity: delayMinutes >= 15 ? "REINCIDENTE" : "LEVE",
                    createdAt: new Date(data.shiftDate),
                },
            });
            createdIds.push(inc.id);
        }
    }

    // 3. Uniforme no cumplido (RF-09).
    if (data.uniformCheck) {
        const cat = await findCategory("SHIFT_UNIFORME");
        const type = await findType("UNIFORME_INCOMPLETO");
        if (cat && type) {
            for (const [key, value] of Object.entries(data.uniformCheck)) {
                if (value && value.value === false) {
                    const inc = await prismaClient.incident.create({
                        data: {
                            guardId: data.userId,
                            kind: "INCIDENT",
                            title: `Uniforme: ${key}`,
                            description:
                                value.note ??
                                `Ítem de uniforme "${key}" no cumplido en turno ${data.shiftType}.`,
                            categoryId: cat.id,
                            typeId: type.id,
                            severity: "LEVE",
                            createdAt: new Date(data.shiftDate),
                        },
                    });
                    createdIds.push(inc.id);
                }
            }
        }
    }

    // 4. Handover (entrega de turno) con ítems no cumplidos.
    if (data.handoverItems) {
        const cat = await findCategory("SHIFT_ENTREGA");
        if (cat) {
            for (const [key, value] of Object.entries(data.handoverItems)) {
                if (value && value.value === false) {
                    const typeName =
                        key === "reportedToAdmin"
                            ? "NOVEDADES_NO_REPORTADAS"
                            : "EQUIPO_FALTANTE";
                    const type = await findType(typeName);
                    if (type) {
                        const inc = await prismaClient.incident.create({
                            data: {
                                guardId: data.userId,
                                kind: "INCIDENT",
                                title: `Entrega: ${key}`,
                                description:
                                    value.note ??
                                    `Ítem de entrega "${key}" no cumplido.`,
                                categoryId: cat.id,
                                typeId: type.id,
                                severity: "LEVE",
                                createdAt: new Date(data.shiftDate),
                            },
                        });
                        createdIds.push(inc.id);
                    }
                }
            }
        }
    }

    // Notificación Ably (RF-12) — se hace tras crear las incidencias.
    if (createdIds.length > 0) {
        try {
            await publishShiftIncident({
                actorId,
                shiftCheckId,
                incidentIds: createdIds,
                summary: `${createdIds.length} incidencia(s) generada(s) en el turno ${data.shiftType} del ${data.shiftDate}.`,
            });
        } catch (error) {
            console.warn("[ShiftCheck] No se pudo notificar (Ably):", error);
        }
    }

    return createdIds;
};

/**
 * @description Lista ShiftCheck para datatable con paginación y filtros (RF-11).
 */
export const getDataTableShiftChecks = async (
    params: ITDataTableFetchParams,
): Promise<ITDataTableResponse<any>> => {
    const prismaParams = getPrismaPaginationParams(params);
    const where = prismaParams.where as Record<string, any>;

    const searchVal = String(params.filters.search || "").trim();
    if (searchVal.length > 0) {
        delete where.search;
        where.OR = [
            { observations: { contains: searchVal, mode: "insensitive" } },
            { user: { name: { contains: searchVal, mode: "insensitive" } } },
            { user: { lastName: { contains: searchVal, mode: "insensitive" } } },
        ];
    }

    const [rows, total] = await Promise.all([
        prismaClient.shiftCheck.findMany({
            ...prismaParams,
            include: {
                user: { select: { id: true, name: true, lastName: true, username: true } },
                createdBy: { select: { id: true, name: true, lastName: true } },
                signedBy: { select: { id: true, name: true, lastName: true } },
                deliveredBy: { select: { id: true, name: true, lastName: true } },
                receivedBy: { select: { id: true, name: true, lastName: true } },
            },
            orderBy: prismaParams.orderBy || { shiftDate: "desc" },
        }),
        prismaClient.shiftCheck.count({ where: prismaParams.where }),
    ]);

    return { rows, total };
};

/**
 * @description Crea un ShiftCheck (RF-01..RF-04).
 * - Calcula scheduledStartAt a partir del User.scheduleId (Schedule.startTime).
 * - Calcula delayMinutes/isLate.
 * - Idempotente por clientRef (Offline-First).
 */
export const createShiftCheck = async (
    data: CreateShiftCheckInput,
    actorId: number,
) => {
    if (data.clientRef) {
        const existing = await prismaClient.shiftCheck.findUnique({
            where: { clientRef: data.clientRef },
        });
        if (existing) return existing;
    }

    const shiftDate = new Date(data.shiftDate);
    const actualEntryAt = data.actualEntryAt ? new Date(data.actualEntryAt) : null;

    // Resolver scheduledStartAt desde el Schedule del elemento (RF-02).
    let scheduledStartAt = new Date(shiftDate);
    const user = await prismaClient.user.findUnique({
        where: { id: data.userId },
        include: { schedule: true },
    });
    if (user?.schedule?.startTime) {
        const parsed = parseScheduleTime(shiftDate, user.schedule.startTime);
        if (parsed) scheduledStartAt = parsed;
    }

    const { delayMinutes, isLate } = computePuntuality(scheduledStartAt, actualEntryAt);

    const shiftCheck = await prismaClient.shiftCheck.create({
        data: {
            clientRef: data.clientRef ?? crypto.randomUUID(),
            userId: data.userId,
            shiftDate,
            shiftType: data.shiftType,
            scheduledStartAt,
            actualEntryAt: actualEntryAt ?? undefined,
            delayMinutes,
            isLate,
            isAbsent: data.isAbsent ?? false,
            uniformCheck: data.uniformCheck ?? undefined,
            handoverItems: data.handoverItems ?? undefined,
            observations: data.observations ?? undefined,
            createdById: actorId,
        },
    });

    // Genera Incidents automáticas (RF-07/08/09) y notifica por Ably.
    await generateIncidentsFromShiftCheck(shiftCheck.id, data, actorId, delayMinutes);

    return shiftCheck;
};

/**
 * @description Actualiza un ShiftCheck antes de que esté firmado.
 */
export const updateShiftCheck = async (
    id: string,
    data: {
        actualEntryAt?: string | null;
        isAbsent?: boolean;
        uniformCheck?: any;
        handoverItems?: any;
        observations?: string | null;
    },
) => {
    const existing = await prismaClient.shiftCheck.findUnique({ where: { id } });
    if (!existing) throw new Error("ShiftCheck no encontrado");
    if (existing.status === "SIGNED") {
        throw new Error("No se puede editar un registro firmado");
    }

    const actualEntryAt =
        data.actualEntryAt !== undefined
            ? data.actualEntryAt
                ? new Date(data.actualEntryAt)
                : null
            : existing.actualEntryAt;

    const { delayMinutes, isLate } = computePuntuality(
        existing.scheduledStartAt,
        actualEntryAt,
    );

    return prismaClient.shiftCheck.update({
        where: { id },
        data: {
            actualEntryAt: actualEntryAt ?? undefined,
            isAbsent: data.isAbsent ?? existing.isAbsent,
            uniformCheck: data.uniformCheck ?? existing.uniformCheck,
            handoverItems: data.handoverItems ?? existing.handoverItems,
            observations: data.observations ?? existing.observations,
            delayMinutes,
            isLate,
            status: "COMPLETED",
        },
    });
};

/**
 * @description Firma el ShiftCheck validando credenciales del que entrega y
 * del que recibe (RF-05, Opción A: reuso de User.password + bcrypt).
 */
export const signShiftCheck = async (
    id: string,
    creds: {
        deliveredUsername: string;
        deliveredPassword: string;
        receivedUsername: string;
        receivedPassword: string;
    },
) => {
    const shiftCheck = await prismaClient.shiftCheck.findUnique({ where: { id } });
    if (!shiftCheck) throw new Error("ShiftCheck no encontrado");
    if (shiftCheck.status === "SIGNED") {
        throw new Error("El registro ya está firmado");
    }

    const [delivered, received] = await Promise.all([
        prismaClient.user.findUnique({ where: { username: creds.deliveredUsername } }),
        prismaClient.user.findUnique({ where: { username: creds.receivedUsername } }),
    ]);

    if (!delivered || !received) {
        throw new Error("Usuario entregador o receptor no encontrado");
    }
    if (!delivered.active || delivered.softDelete) {
        throw new Error("El usuario entregador está inactivo");
    }
    if (!received.active || received.softDelete) {
        throw new Error("El usuario receptor está inactivo");
    }

    const [deliveredOk, receivedOk] = await Promise.all([
        comparePassword(creds.deliveredPassword, delivered.password),
        comparePassword(creds.receivedPassword, received.password),
    ]);

    if (!deliveredOk) throw new Error("Credenciales del entregador inválidas");
    if (!receivedOk) throw new Error("Credenciales del receptor inválidas");

    return prismaClient.shiftCheck.update({
        where: { id },
        data: {
            status: "SIGNED",
            signedById: delivered.id,
            signedAt: new Date(),
            deliveredById: delivered.id,
            receivedById: received.id,
        },
    });
};

/**
 * @description Obtiene un ShiftCheck por id.
 */
export const getShiftCheckById = async (id: string) => {
    return prismaClient.shiftCheck.findUnique({
        where: { id },
        include: {
            user: { select: { id: true, name: true, lastName: true, username: true, scheduleId: true } },
            createdBy: { select: { id: true, name: true, lastName: true } },
            signedBy: { select: { id: true, name: true, lastName: true } },
            deliveredBy: { select: { id: true, name: true, lastName: true } },
            receivedBy: { select: { id: true, name: true, lastName: true } },
        },
    });
};

/**
 * @description Lista turnos del día (RF-04 + RF-14): qué schedules hay y si
 * ya tienen ShiftCheck capturado. Útil para el dashboard y para los
 * recordatorios de las 7am/7pm.
 */
export const getShiftDayOverview = async (date: Date) => {
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);

    const [matutino, nocturno] = await Promise.all([
        prismaClient.shiftCheck.findMany({
            where: { shiftDate: { gte: dayStart, lte: dayEnd }, shiftType: "MATUTINO" },
            include: { user: { select: { id: true, name: true, lastName: true } } },
        }),
        prismaClient.shiftCheck.findMany({
            where: { shiftDate: { gte: dayStart, lte: dayEnd }, shiftType: "NOCTURNO" },
            include: { user: { select: { id: true, name: true, lastName: true } } },
        }),
    ]);
    return { matutino, nocturno };
};

/**
 * @description Histórico por elemento (RF-11): filtros por userId y rango.
 */
export const getShiftCheckHistoryByUser = async (
    userId: number,
    startDate?: Date,
    endDate?: Date,
) => {
    return prismaClient.shiftCheck.findMany({
        where: {
            userId,
            ...(startDate && endDate ? { shiftDate: { gte: startDate, lte: endDate } } : {}),
        },
        orderBy: { shiftDate: "desc" },
        include: {
            signedBy: { select: { id: true, name: true, lastName: true } },
            deliveredBy: { select: { id: true, name: true, lastName: true } },
            receivedBy: { select: { id: true, name: true, lastName: true } },
        },
    });
};
