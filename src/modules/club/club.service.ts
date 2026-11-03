import { prismaClient } from "@src/core/config/database";
import { AppError } from "@src/core/errors/app-error";
import { assertStatusUpdated, assertTransition, INCIDENT_TRANSITIONS } from "@src/core/transitions/transitions";
import { LIST_MAX_ROWS } from "@src/core/constants/limits";
import { USER_PUBLIC_SELECT } from "@src/core/constants/user-select";
import { ITDataTableFetchParams, ITDataTableResponse } from "@src/core/dto/datatable.dto";
import { getPrismaPaginationParams } from "@src/core/utils/prisma-pagination.utils";
import { ClientScope, scopeByClient } from "@src/core/scope/client-scope";

/**
 * @description Constante discriminadora para los registros de Casa Club.
 * Los reportes de Casa Club comparten la tabla `Incident` pero se segregan
 * mediante el campo `type = 'CASA_CLUB'`, igual que los incidentes usan
 * `'INCIDENT'` y mantenimiento su propia tabla.
 */
const CLUB_TYPE = 'CASA_CLUB';

export const getDataTableClub = async (params: ITDataTableFetchParams, scope: ClientScope | undefined): Promise<ITDataTableResponse<any>> => {
    // Sin cliente en el alcance es 403, no una tabla vacía.
    const { clientId } = scopeByClient(scope);
    const prismaParams = getPrismaPaginationParams(params);

    const searchVal = String(params.filters?.search || "").trim();
    if (searchVal.length > 0) {
        delete prismaParams.where.search;
        prismaParams.where.OR = [
            { title: { contains: searchVal, mode: 'insensitive' } },
            { description: { contains: searchVal, mode: 'insensitive' } },
            { category: { value: { contains: searchVal, mode: 'insensitive' } } },
            { type: { value: { contains: searchVal, mode: 'insensitive' } } }
        ];
    }

    // "ALL" significa sin filtro de estado; el util genérico ya lo habría copiado tal cual al where.
    if (params.filters?.status && params.filters.status !== 'ALL') {
        prismaParams.where.status = params.filters.status;
    } else {
        delete prismaParams.where.status;
    }

    delete prismaParams.where.kind;
    prismaParams.where.kind = CLUB_TYPE;
    // El filtro del cliente sale del alcance, nunca del cuerpo de la petición.
    delete prismaParams.where.clientId;
    prismaParams.where.clientId = clientId;

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

export const createClub = async (data: {
    guardId: number;
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

    const club = await prismaClient.incident.create({
        data: {
            guardId: data.guardId,
            kind: CLUB_TYPE,
            clientId,
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

    return club;
};

export const getClubs = async (filters: {
    startDate?: Date;
    endDate?: Date;
    guardId?: number;
    category?: string;
    title?: string;
}, scope: ClientScope | undefined) => {
    const whereClause: any = { kind: CLUB_TYPE, ...scopeByClient(scope) };

    if (filters.startDate && filters.endDate) {
        whereClause.createdAt = { gte: filters.startDate, lte: filters.endDate };
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
            resolvedBy: { select: USER_PUBLIC_SELECT },
            category: true,
            type: true
        },
        orderBy: { createdAt: 'desc' }
    });
};

export const resolveClub = async (id: number, userId: number, scope: ClientScope | undefined) => {
    // Solo reportes de casa club (no incidencias), del cliente del alcance y solo una vez.
    const current = await prismaClient.incident.findFirst({
        where: { id, kind: CLUB_TYPE, ...scopeByClient(scope) },
        select: { status: true },
    });
    if (!current) throw new AppError("CLUB_NOT_FOUND", "Reporte de casa club no encontrado", 404);
    assertTransition(INCIDENT_TRANSITIONS, current.status, "ATTENDED");

    const { count } = await prismaClient.incident.updateMany({
        where: { id, kind: CLUB_TYPE, status: current.status, ...scopeByClient(scope) },
        data: { status: 'ATTENDED', resolvedAt: new Date(), resolvedById: userId },
    });
    assertStatusUpdated(count);

    return prismaClient.incident.findUniqueOrThrow({
        where: { id },
        include: {
            guard: { select: USER_PUBLIC_SELECT },
            resolvedBy: { select: USER_PUBLIC_SELECT },
            category: true,
            type: true
        }
    });
};

export const getPendingClubsCount = async (scope: ClientScope | undefined) => {
    return prismaClient.incident.count({
        where: {
            status: 'PENDING',
            kind: CLUB_TYPE,
            ...scopeByClient(scope)
        }
    });
};

export const getClubById = async (id: number, scope: ClientScope | undefined) => {
    return prismaClient.incident.findFirst({
        where: { id, kind: CLUB_TYPE, ...scopeByClient(scope) },
        include: { guard: { select: USER_PUBLIC_SELECT } }
    });
};

export const deleteClub = async (id: number) => {
    return prismaClient.incident.delete({
        where: { id }
    });
};

export const updateClubMedia = async (id: number, media: any[]) => {
    return prismaClient.incident.update({
        where: { id },
        data: { media }
    });
};
