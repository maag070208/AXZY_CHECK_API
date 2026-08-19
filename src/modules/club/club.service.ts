import { prismaClient } from "@src/core/config/database";
import { ITDataTableFetchParams, ITDataTableResponse } from "@src/core/dto/datatable.dto";
import { getPrismaPaginationParams } from "@src/core/utils/prisma-pagination.utils";

/**
 * @description Constante discriminadora para los registros de Casa Club.
 * Los reportes de Casa Club comparten la tabla `Incident` pero se segregan
 * mediante el campo `type = 'CASA_CLUB'`, igual que los incidentes usan
 * `'INCIDENT'` y mantenimiento su propia tabla.
 */
const CLUB_TYPE = 'CASA_CLUB';

export const getDataTableClub = async (params: ITDataTableFetchParams): Promise<ITDataTableResponse<any>> => {
    const prismaParams = getPrismaPaginationParams(params);

    const searchVal = String(params.filters.search || "").trim();
    if (searchVal.length > 0) {
        delete prismaParams.where.search;
        prismaParams.where.OR = [
            { title: { contains: searchVal, mode: 'insensitive' } },
            { description: { contains: searchVal, mode: 'insensitive' } },
            { category: { value: { contains: searchVal, mode: 'insensitive' } } },
            { type: { value: { contains: searchVal, mode: 'insensitive' } } }
        ];
    }

    if (params.filters.status && params.filters.status !== 'ALL') {
        prismaParams.where.status = params.filters.status;
    }

    delete prismaParams.where.kind;
    prismaParams.where.kind = CLUB_TYPE;

    const [rows, total] = await Promise.all([
        prismaClient.incident.findMany({
            ...prismaParams,
            include: {
                guard: true,
                resolvedBy: true,
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
}) => {
    if (data.clientRef) {
        const existing = await prismaClient.incident.findUnique({
            where: { clientRef: data.clientRef },
        });
        if (existing) return existing;
    }

    const club = await prismaClient.incident.create({
        data: {
            guardId: data.guardId,
            kind: CLUB_TYPE,
            title: data.title,
            categoryId: data.categoryId,
            typeId: data.typeId,
            description: data.description,
            media: data.media,
            latitude: data.latitude,
            longitude: data.longitude,
            clientRef: data.clientRef,
            createdAt: data.createdAt ?? undefined,
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
}) => {
    const whereClause: any = { kind: CLUB_TYPE };

    if (filters.startDate && filters.endDate) {
        whereClause.createdAt = { gte: filters.startDate, lte: filters.endDate };
    } else if (filters.startDate) {
        whereClause.createdAt = { gte: filters.startDate };
    }

    if (filters.guardId) whereClause.guardId = filters.guardId;
    if (filters.category) whereClause.category = filters.category;
    if (filters.title) whereClause.title = { contains: filters.title, mode: 'insensitive' };

    return prismaClient.incident.findMany({
        where: whereClause,
        include: {
            guard: true,
            resolvedBy: true,
            category: true,
            type: true
        },
        orderBy: { createdAt: 'desc' }
    });
};

export const resolveClub = async (id: number, userId: number) => {
    return prismaClient.incident.update({
        where: { id },
        data: {
            status: 'ATTENDED',
            resolvedAt: new Date(),
            resolvedById: userId
        },
        include: {
            guard: true,
            resolvedBy: true,
            category: true,
            type: true
        }
    });
};

export const getPendingClubsCount = async () => {
    return prismaClient.incident.count({
        where: {
            status: 'PENDING',
            kind: CLUB_TYPE
        }
    });
};

export const getClubById = async (id: number) => {
    return prismaClient.incident.findFirst({
        where: { id, kind: CLUB_TYPE },
        include: { guard: true }
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
