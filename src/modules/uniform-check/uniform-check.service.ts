import { prismaClient } from "@src/core/config/database";
import { ITDataTableFetchParams, ITDataTableResponse } from "@src/core/dto/datatable.dto";
import { getPrismaPaginationParams } from "@src/core/utils/prisma-pagination.utils";
import { IncidentSeverity, UniformCompliance } from "@prisma/client";
import { CreateUniformCheckInput, UNIFORM_ITEMS } from "./uniform-check.dto";
import { publishShiftIncident } from "../notifications/notifications.service";

/**
 * @description Calcula el cumplimiento agregado según ítems CUMPLIDOS.
 *  - EXCELENTE: 7-9 ítems cumplidos.
 *  - MEDIO:     4-6 ítems cumplidos.
 *  - MALO:      0-3 ítems cumplidos.
 * También devuelve el número de ítems fallidos (failedCount) para métricas y
 * la severidad disciplinaria del Incident (mapa a IncidentSeverity — los
 * Incident siguen usando LEVE/REINCIDENTE/GRAVE).
 */
const computeUniformResult = (
    items: CreateUniformCheckInput["items"]): {
    failedCount: number;
    compliance: UniformCompliance;
    severity: IncidentSeverity;
} => {
    const values = Object.values(items).filter((v) => v && typeof v.value === "boolean");
    const passedCount = values.filter((v) => v.value === true).length;
    const failedCount = values.length - passedCount;

    let compliance: UniformCompliance = "EXCELENTE";
    if (passedCount <= 3) compliance = "MALO";
    else if (passedCount <= 6) compliance = "MEDIO";

    const severity: IncidentSeverity =
        compliance === "MALO" ? "GRAVE": compliance === "MEDIO" ? "REINCIDENTE": "LEVE";

    return { failedCount, compliance, severity };
};

/**
 * @description Normaliza una fecha al inicio del día (UTC). Se usa para que
 * el upsert de uniforme sea por (guardia, día): re-verificar el mismo día
 * actualiza el registro en vez de crear uno nuevo.
 */
const startOfDayUtc = (d: Date): Date => {
    const copy = new Date(d);
    copy.setUTCHours(0, 0, 0, 0);
    return copy;
};

/**
 * @description Crea (o actualiza, si ya existe para el mismo día) un
 * UniformCheck y sincroniza los Incident tipo SHIFT_UNIFORME con los ítems
 * no cumplidos..
 * Cada guardia tiene UN registro por día: re-verificarlo actualiza en vez de
 * duplicar. Siempre se registra (incluso con 0 fallos) para mantener el
 * historial de cumplimiento.
 * Devuelve el UniformCheck creado/actualizado junto con los incidents activos.
 */
export const createUniformCheck = async (
    data: CreateUniformCheckInput,
    actorId: number) => {
    const { failedCount, compliance, severity } = computeUniformResult(data.items);
    const dayKey = startOfDayUtc(new Date(data.checkedAt ?? Date.now()));

    const existing = await prismaClient.uniformCheck.findUnique({
        where: {
            userId_checkedAt: { userId: data.userId, checkedAt: dayKey },
        },
    });

    const uniformCheck = existing
        ? await prismaClient.uniformCheck.update({
              where: { id: existing.id },
              data: {
                  items: data.items,
                  failedCount,
                  severity: compliance,
                  observations: data.observations ?? undefined,
                  context: data.context ?? "SHIFT",
                  shiftCheckId: data.shiftCheckId ?? undefined,
                  checkedById: actorId,
              },
          }): await prismaClient.uniformCheck.create({
              data: {
                  clientRef: data.clientRef ?? crypto.randomUUID(),
                  userId: data.userId,
                  checkedAt: dayKey,
                  items: data.items,
                  failedCount,
                  severity: compliance,
                  observations: data.observations ?? undefined,
                  context: data.context ?? "SHIFT",
                  shiftCheckId: data.shiftCheckId ?? undefined,
                  checkedById: actorId,
              },
          });

    // Sincroniza Incidents de uniforme (: elimina los previos generados
    // por este UniformCheck y recrea los de los ítems actualmente fallidos,
    // para no duplicar en cada re-verificación del mismo día.
    const prevIds = (existing?.incidentIds as number[] | null) ?? [];
    if (prevIds.length > 0) {
        await prismaClient.incident.deleteMany({ where: { id: { in: prevIds } } });
    }

    const createdIds: number[] = [];
    if (failedCount > 0) {
        const cat = await prismaClient.incidentCategory.findUnique({
            where: { name: "SHIFT_UNIFORME" },
        });
        const type = await prismaClient.incidentType.findUnique({
            where: { name: "UNIFORME_INCOMPLETO" },
        });
        if (cat && type) {
            for (const [key, value] of Object.entries(data.items)) {
                if (value && value.value === false) {
                    const inc = await prismaClient.incident.create({
                        data: {
                            guardId: data.userId,
                            kind: "INCIDENT",
                            title: `Uniforme: ${key}`,
                            description:
                                value.note ??
                                `Ítem de uniforme "${key}" no cumplido (${uniformCheck.clientRef}).`,
                            categoryId: cat.id,
                            typeId: type.id,
                            severity,
                            createdAt: uniformCheck.checkedAt,
                        },
                    });
                    createdIds.push(inc.id);
                }
            }
        }
    }

    const updated = await prismaClient.uniformCheck.update({
        where: { id: uniformCheck.id },
        data: { incidentIds: createdIds },
    });

    // Notificación Ably.
    if (createdIds.length > 0) {
        try {
            await publishShiftIncident({
                actorId,
                shiftCheckId: updated.shiftCheckId ?? updated.id,
                incidentIds: createdIds,
                summary: `${createdIds.length} incidencia(s) de uniforme registrada(s) en la verificación ${updated.clientRef}.`,
            });
        } catch (error) {
            console.warn("[UniformCheck] No se pudo notificar (Ably):", error);
        }
    }

    return {...updated, incidentIds: createdIds };
};

/**
 * @description Lista UniformCheck para datatable con paginación y filtros.
 */
export const getDataTableUniformChecks = async (
    params: ITDataTableFetchParams): Promise<ITDataTableResponse<any>> => {
    const { skip, take, orderBy } = getPrismaPaginationParams(params);
    // Orden del más reciente al más antiguo (por defecto). checkedAt está
    // normalizado al día; createdAt desempata dentro del mismo día.
    const effectiveOrderBy = params.sort?.key
        ? orderBy: [{ checkedAt: "desc" as const }, { createdAt: "desc" as const }];
    const where: any = {};
    if (params.filters) {
        for (const key of ["userId", "checkedById", "context", "severity"]) {
            const v = (params.filters as any)[key];
            if (v !== undefined && v !== null && v !== "") where[key] = v;
        }
        const searchVal = String((params.filters as any)?.search ?? "").trim();
        if (searchVal.length > 0) {
            delete where.search;
            where.OR = [
                { user: { name: { contains: searchVal } } },
                { user: { lastName: { contains: searchVal } } },
                { user: { username: { contains: searchVal } } },
            ];
        }
        const range = (params.filters as any)?.dateRange;
        if (range?.from) where.checkedAt = { gte: new Date(range.from) };
        if (range?.to) where.checkedAt = {...(where.checkedAt ?? {}), lte: new Date(range.to) };
    }
    const [rows, total] = await Promise.all([
        prismaClient.uniformCheck.findMany({
            where,
            orderBy: effectiveOrderBy,
            skip,
            take,
            include: {
                user: { select: { id: true, name: true, lastName: true, username: true } },
                checkedBy: { select: { id: true, name: true, lastName: true } },
                shiftCheck: { select: { id: true, clientRef: true, shiftType: true } },
            },
        }),
        prismaClient.uniformCheck.count({ where }),
    ]);
    return { rows, total };
};

/**
 * @description Detalle de un UniformCheck por id.
 */
export const getUniformCheckById = async (id: string) =>
    prismaClient.uniformCheck.findUnique({
        where: { id },
        include: {
            user: { select: { id: true, name: true, lastName: true, username: true } },
            checkedBy: { select: { id: true, name: true, lastName: true } },
            shiftCheck: { select: { id: true, clientRef: true, shiftType: true } },
        },
    });

/**
 * @description Historial de uniforme por guardia ( / perfiles).
 */
export const getUniformCheckHistoryByUser = async (
    userId: number,
    startDate?: Date,
    endDate?: Date) => {
    const where: any = { userId };
    if (startDate && endDate) where.checkedAt = { gte: startDate, lte: endDate };
    return prismaClient.uniformCheck.findMany({
        where,
        orderBy: { checkedAt: "desc" },
        include: {
            checkedBy: { select: { id: true, name: true, lastName: true } },
            shiftCheck: { select: { id: true, clientRef: true, shiftType: true } },
        },
    });
};

/**
 * @description Lista estática de ítems de uniforme para que la UI los renderice
 * siempre en el mismo orden.
 */
export const getUniformItemsCatalog = () =>
    UNIFORM_ITEMS.map((item) => ({ key: item.key, label: item.label }));