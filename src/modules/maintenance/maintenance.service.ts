import { prismaClient } from "@src/core/config/database";
import { ITDataTableFetchParams, ITDataTableResponse } from "@src/core/dto/datatable.dto";
import { getPrismaPaginationParams } from "@src/core/utils/prisma-pagination.utils";

export const getDataTableMaintenances = async (params: ITDataTableFetchParams): Promise<ITDataTableResponse<any>> => {
    const prismaParams = getPrismaPaginationParams(params);

    const [rows, total] = await Promise.all([
        prismaClient.maintenance.findMany({
            ...prismaParams,
            include: { 
                guard: true,
                resolvedBy: true
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
    /** Idempotency key generado en el cliente (offline-first). */
    clientRef?: string;
    /** Hora original del evento en el dispositivo del guardia (offline-first). */
    createdAt?: Date;
}) => {
    // Idempotencia: si el clientRef ya fue registrado (reintento de sync
    // offline), regresamos el registro existente en vez de duplicarlo.
    if (data.clientRef) {
        const existing = await prismaClient.maintenance.findUnique({
            where: { clientRef: data.clientRef },
        });
        if (existing) return existing;
    }

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
            longitude: data.longitude,
            clientRef: data.clientRef,
            createdAt: data.createdAt ?? undefined,
        }
    });

    setImmediate(async () => {
        try {
            const enrichedMaintenance = await prismaClient.maintenance.findUnique({
                where: { id: maintenance.id },
                include: { 
                    guard: true,
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
        include: { 
            guard: true,
            resolvedBy: true
        },
        orderBy: { createdAt: 'desc' }
    });
};

export const resolveMaintenance = async (id: number, userId: number) => {
    return prismaClient.maintenance.update({
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
            guard: true,
            resolvedBy: true
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

/**
 * @description Anexa evidencia subida después de crear el registro (flujo
 * "guardar y subir después" para offline). Deduplica por `key`.
 */
export const appendMaintenanceMedia = async (id: number, newMedia: any[]) => {
    const maintenance = await prismaClient.maintenance.findUnique({ where: { id } });
    if (!maintenance) return null;

    const current: any[] = Array.isArray(maintenance.media) ? (maintenance.media as any[]) : [];
    const existingKeys = new Set(current.map((m: any) => m?.key).filter(Boolean));
    const merged = [
        ...current,
        ...newMedia.filter((m: any) => !m?.key || !existingKeys.has(m.key)),
    ];

    return prismaClient.maintenance.update({
        where: { id },
        data: { media: merged },
    });
};
