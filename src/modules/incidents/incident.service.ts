import { prismaClient } from "@src/core/config/database";
import { ITDataTableFetchParams, ITDataTableResponse } from "@src/core/dto/datatable.dto";
import { getPrismaPaginationParams } from "@src/core/utils/prisma-pagination.utils";

export const getDataTableIncidents = async (params: ITDataTableFetchParams): Promise<ITDataTableResponse<any>> => {
    const prismaParams = getPrismaPaginationParams(params);

    // Handle combined search (if any)
    const searchVal = String(params.filters.search || "").trim();
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
    if (params.filters.status && params.filters.status !== 'ALL') {
        prismaParams.where.status = params.filters.status;
    }

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
import { sendIncidentEmail } from "@src/core/utils/emailSender";

export const createIncident = async (data: {
    guardId: number;
    title: string;
    categoryId?: number;
    typeId?: number;
    description?: string;
    media?: any;
    latitude?: number;
    longitude?: number;
}) => {
    const incident = await prismaClient.incident.create({
        data: {
            guardId: data.guardId,
            title: data.title,
            categoryId: data.categoryId,
            typeId: data.typeId,
            description: data.description,
            media: data.media,
            latitude: data.latitude,
            longitude: data.longitude
        }
    });

    // Fire and forget EVERYTHING including relation fetching
    setImmediate(async () => {
        try {
            const enrichedIncident = await prismaClient.incident.findUnique({
                where: { id: incident.id },
                include: {
                    guard: true,
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

    return incident;
};

export const getIncidentsByGuard = async (guardId: number) => {
    return prismaClient.incident.findMany({
        where: { guardId },
        orderBy: { createdAt: 'desc' }
    });
};

export const getIncidents = async (filters: {
    startDate?: Date;
    endDate?: Date;
    guardId?: number;
    category?: string;
    title?: string;
}) => {
    const whereClause: any = {};

    if (filters.startDate && filters.endDate) {
        whereClause.createdAt = {
            gte: filters.startDate,
            lte: filters.endDate
        };
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
            resolvedBy: true
        },
        orderBy: { createdAt: 'desc' }
    });
};

export const resolveIncident = async (id: number, userId: number) => {
    return prismaClient.incident.update({
        where: { id },
        data: {
            status: 'ATTENDED',
            resolvedAt: new Date(),
            resolvedById: userId
        },
        include: {
            guard: true,
            resolvedBy: true
        }
    });
};

export const getPendingIncidentsCount = async () => {
    return prismaClient.incident.count({
        where: {
            status: 'PENDING'
        }
    });
};

export const getIncidentById = async (id: number) => {
    return prismaClient.incident.findUnique({
        where: { id },
        include: { guard: true }
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
