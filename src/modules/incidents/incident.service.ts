import { prismaClient } from "@src/core/config/database";
import { AppError } from "@src/core/errors/app-error";
import { assertStatusUpdated, assertTransition, INCIDENT_TRANSITIONS } from "@src/core/transitions/transitions";
import { LIST_MAX_ROWS } from "@src/core/constants/limits";
import { USER_PUBLIC_SELECT } from "@src/core/constants/user-select";
import { ITDataTableFetchParams, ITDataTableResponse } from "@src/core/dto/datatable.dto";
import { getPrismaPaginationParams } from "@src/core/utils/prisma-pagination.utils";
import { ABLY_CHANNELS, publishToChannel } from "@src/core/config/ably";
import { ClientScope, scopeByClient } from "@src/core/scope/client-scope";
import { sendIncidentEmail } from "@src/core/utils/emailSender";

/**
 * "Incidencia" y "Casa Club" comparten la misma tabla `Incident`,
 * distinguidas por `kind` (Casa Club usa `kind: 'CASA_CLUB'`, ver
 * club.service.ts). Antes NINGUNA consulta de este archivo filtraba por
 * `kind`, así que un reporte de Casa Club aparecía también en Incidencias
 * (y se contaba en sus KPIs/analytics). Todo lo de aquí debe filtrar por
 * este valor.
 */
const INCIDENT_KIND = "INCIDENT";

export const getDataTableIncidents = async (params: ITDataTableFetchParams, scope: ClientScope | undefined): Promise<ITDataTableResponse<any>> => {
    // Sin cliente en el alcance es 403, no una tabla vacía.
    const { clientId } = scopeByClient(scope);
    const prismaParams = getPrismaPaginationParams(params);

    delete prismaParams.where.kind;
    prismaParams.where.kind = INCIDENT_KIND;
    // El filtro del cliente sale del alcance, nunca del cuerpo de la petición.
    delete prismaParams.where.clientId;
    prismaParams.where.clientId = clientId;

    // Handle combined search (if any)
    const searchVal = String(params.filters?.search || "").trim();
    if (searchVal.length > 0) {
        delete prismaParams.where.search; // Remove generic search added by util
        prismaParams.where.OR = [
            { title: { contains: searchVal, mode: 'insensitive' } },
            { description: { contains: searchVal, mode: 'insensitive' } },
            { category: { value: { contains: searchVal, mode: 'insensitive' } } },
            { type: { value: { contains: searchVal, mode: 'insensitive' } } }
        ];
    }

    // Handle status enum (Prisma enums don't support 'contains')
    // "ALL" significa sin filtro de estado; el util genérico ya lo habría copiado tal cual al where.
    if (params.filters?.status && params.filters.status !== 'ALL') {
        prismaParams.where.status = params.filters.status;
    } else {
        delete prismaParams.where.status;
    }

    const [rows, total] = await Promise.all([
        prismaClient.incident.findMany({
            ...prismaParams,
            include: { 
                guard: { select: USER_PUBLIC_SELECT },
                resolvedBy: { select: USER_PUBLIC_SELECT },
                category: true,
                type: true
            },
            orderBy: prismaParams.orderBy || { createdAt: 'desc' }
        }),
        prismaClient.incident.count({
            where: prismaParams.where
        })
    ]);

    return { rows, total };
};

export const createIncident = async (data: {
    guardId: number;
    propertyId?: number;
    title: string;
    categoryId?: number;
    typeId?: number;
    description?: string;
    media?: any;
    latitude?: number;
    longitude?: number;
    clientRef?: string;
    createdAt?: Date;
    createdOffline?: boolean;
    syncedAt?: Date;
}, scope: ClientScope | undefined) => {
    const { clientId } = scopeByClient(scope);
    if (data.clientRef) {
        const existing = await prismaClient.incident.findUnique({
            where: { clientRef: data.clientRef },
        });
        if (existing) {
            // Reintento offline de otro cliente: no se devuelve ni se reubica.
            if (existing.clientId !== clientId) {
                throw new AppError("CLIENT_REF_CONFLICT", "La clave de sincronización pertenece a otro registro.", 409);
            }
            return existing;
        }
    }

    // La propiedad que se menciona tiene que ser del cliente donde trabaja quien reporta.
    if (data.propertyId) {
        const property = await prismaClient.property.findFirst({
            where: { id: data.propertyId, clientId, softDelete: false },
            select: { id: true },
        });
        if (!property) throw new AppError("PROPERTY_NOT_FOUND", "Propiedad no encontrada", 400);
    }

    const incident = await prismaClient.incident.create({
        data: {
            kind: INCIDENT_KIND,
            clientId,
            guardId: data.guardId,
            propertyId: data.propertyId,
            title: data.title,
            categoryId: data.categoryId,
            typeId: data.typeId,
            description: data.description,
            media: data.media,
            latitude: data.latitude,
            longitude: data.longitude,
            clientRef: data.clientRef,
            createdAt: data.createdAt ?? undefined,
            createdOffline: data.createdOffline ?? false,
            syncedAt: data.syncedAt,
        }
    });

    // Fire and forget EVERYTHING including relation fetching
    setImmediate(async () => {
        try {
            const enrichedIncident = await prismaClient.incident.findUnique({
                where: { id: incident.id },
                include: {
                    guard: { select: USER_PUBLIC_SELECT },
                    category: true,
                    type: true
                }
            });
            if (enrichedIncident) {
                await sendIncidentEmail(enrichedIncident, enrichedIncident.guard);
            }
        } catch (error) {
            console.error("Background incident processing error:", error);
        }
    });

    // Live dashboard (Home de WEB): una incidencia nueva puede entrar a la
    // lista de alertas ("incidencias abiertas").
    publishToChannel(ABLY_CHANNELS.DASHBOARD_LIVE, 'refresh', { reason: 'incident-created', incidentId: incident.id });

    return incident;
};

export const getIncidentsByGuard = async (guardId: number, scope: ClientScope | undefined) => {
    return prismaClient.incident.findMany({
        where: { guardId, kind: INCIDENT_KIND, ...scopeByClient(scope) },
        orderBy: { createdAt: 'desc' }
    });
};

export const getIncidents = async (filters: {
    startDate?: Date;
    endDate?: Date;
    guardId?: number;
    category?: string;
    title?: string;
}, scope: ClientScope | undefined) => {
    const whereClause: any = { kind: INCIDENT_KIND, ...scopeByClient(scope) };

    if (filters.startDate && filters.endDate) {
        whereClause.createdAt = {
            gte: filters.startDate,
            lte: filters.endDate
        };
    } else if (filters.startDate) {
        whereClause.createdAt = { gte: filters.startDate };
    }

    if (filters.guardId) whereClause.guardId = filters.guardId;
    if (filters.category) whereClause.category = { OR: [{ name: filters.category }, { value: filters.category }] };
    if (filters.title) whereClause.title = { contains: filters.title, mode: 'insensitive' };

    return prismaClient.incident.findMany({
        where: whereClause,
        take: LIST_MAX_ROWS,
        include: { 
            guard: { select: USER_PUBLIC_SELECT },
            resolvedBy: { select: USER_PUBLIC_SELECT }
        },
        orderBy: { createdAt: 'desc' }
    });
};

export const resolveIncident = async (id: number, userId: number, scope: ClientScope | undefined) => {
    // De otro cliente es "no encontrada".
    const current = await prismaClient.incident.findFirst({
        where: { id, kind: INCIDENT_KIND, ...scopeByClient(scope) },
        select: { status: true },
    });
    if (!current) throw new AppError("INCIDENT_NOT_FOUND", "Incidente no encontrado", 404);
    assertTransition(INCIDENT_TRANSITIONS, current.status, "ATTENDED");

    const { count } = await prismaClient.incident.updateMany({
        where: { id, kind: INCIDENT_KIND, status: current.status, ...scopeByClient(scope) },
        data: { status: 'ATTENDED', resolvedAt: new Date(), resolvedById: userId },
    });
    assertStatusUpdated(count);

    return prismaClient.incident.findUniqueOrThrow({
        where: { id },
        include: {
            guard: { select: USER_PUBLIC_SELECT },
            resolvedBy: { select: USER_PUBLIC_SELECT }
        }
    });
};

export const getPendingIncidentsCount = async (scope: ClientScope | undefined) => {
    return prismaClient.incident.count({
        where: {
            status: 'PENDING',
            kind: INCIDENT_KIND,
            ...scopeByClient(scope)
        }
    });
};

export const getIncidentById = async (id: number, scope: ClientScope | undefined) => {
    return prismaClient.incident.findFirst({
        where: { id, kind: INCIDENT_KIND, ...scopeByClient(scope) },
        include: { guard: { select: USER_PUBLIC_SELECT } }
    });
};

export const deleteIncident = async (id: number) => {
    return prismaClient.incident.delete({
        where: { id }
    });
};

export const updateIncidentMedia = async (id: number, media: any[]) => {
    return prismaClient.incident.update({
        where: { id },
        data: { media }
    });
};
