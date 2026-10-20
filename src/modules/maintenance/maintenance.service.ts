import { prismaClient } from "@src/core/config/database";
import { AppError } from "@src/core/errors/app-error";
import { assertStatusUpdated, assertTransition, MAINTENANCE_TRANSITIONS } from "@src/core/transitions/transitions";
import { LIST_MAX_ROWS } from "@src/core/constants/limits";
import { USER_PUBLIC_SELECT } from "@src/core/constants/user-select";
import { ITDataTableFetchParams, ITDataTableResponse } from "@src/core/dto/datatable.dto";
import { getPrismaPaginationParams } from "@src/core/utils/prisma-pagination.utils";

export const getDataTableMaintenances = async (params: ITDataTableFetchParams): Promise<ITDataTableResponse<any>> => {
    const prismaParams = getPrismaPaginationParams(params);

    const [rows, total] = await Promise.all([
        prismaClient.maintenance.findMany({
            ...prismaParams,
            include: { 
                guard: { select: USER_PUBLIC_SELECT },
                resolvedBy: { select: USER_PUBLIC_SELECT }
            },
        }),
        prismaClient.maintenance.count({
            where: prismaParams.where
        })
    ]);

    return { rows, total };
};

import { sendMaintenanceEmail } from "@src/core/utils/emailSender";

export const createMaintenance = async (data: {
    guardId: number;
    title: string;
    categoryId?: number;
    typeId?: number;
    category?: string;
    description?: string;
    media?: any;
    latitude?: number;
    longitude?: number;
}) => {
    const maintenance = await prismaClient.maintenance.create({
        data: {
            guardId: data.guardId,
            title: data.title,
            categoryId: data.categoryId,
            typeId: data.typeId,
            category: data.category,
            description: data.description,
            media: data.media,
            latitude: data.latitude,
            longitude: data.longitude
        }
    });

    setImmediate(async () => {
        try {
            const enrichedMaintenance = await prismaClient.maintenance.findUnique({
                where: { id: maintenance.id },
                include: { 
                    guard: { select: USER_PUBLIC_SELECT },
                    categoryRel: true,
                    type: true
                }
            });
            if (enrichedMaintenance) {
                await sendMaintenanceEmail(enrichedMaintenance, enrichedMaintenance.guard);
            }
        } catch (error) {
            console.error("Background maintenance processing error:", error);
        }
    });

    return maintenance;
};

export const getMaintenancesByGuard = async (guardId: number) => {
    return prismaClient.maintenance.findMany({
        where: { guardId },
        orderBy: { createdAt: 'desc' }
    });
};

export const getMaintenances = async (filters: {
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

    return prismaClient.maintenance.findMany({
        where: whereClause,
        take: LIST_MAX_ROWS,
        include: { 
            guard: { select: USER_PUBLIC_SELECT },
            resolvedBy: { select: USER_PUBLIC_SELECT }
        },
        orderBy: { createdAt: 'desc' }
    });
};

export const resolveMaintenance = async (id: number, userId: number) => {
    const current = await prismaClient.maintenance.findUnique({ where: { id }, select: { status: true } });
    if (!current) throw new AppError("MAINTENANCE_NOT_FOUND", "Reporte de mantenimiento no encontrado", 404);
    assertTransition(MAINTENANCE_TRANSITIONS, current.status, "ATTENDED");

    const { count } = await prismaClient.maintenance.updateMany({
        where: { id, status: current.status },
        data: { status: 'ATTENDED', resolvedAt: new Date(), resolvedById: userId },
    });
    assertStatusUpdated(count);

    return prismaClient.maintenance.findUniqueOrThrow({
        where: { id },
        include: {
            guard: { select: USER_PUBLIC_SELECT },
            resolvedBy: { select: USER_PUBLIC_SELECT }
        }
    });
};

export const getPendingMaintenancesCount = async () => {
    return prismaClient.maintenance.count({
        where: {
            status: 'PENDING'
        }
    });
};

export const getMaintenanceById = async (id: number) => {
    return prismaClient.maintenance.findUnique({
        where: { id },
        include: {
            guard: { select: USER_PUBLIC_SELECT },
            resolvedBy: { select: USER_PUBLIC_SELECT }
        }
    });
};

export const deleteMaintenance = async (id: number) => {
    return prismaClient.maintenance.delete({
        where: { id }
    });
};

export const updateMaintenanceMedia = async (id: number, media: any) => {
    return prismaClient.maintenance.update({
        where: { id },
        data: { media }
    });
};
