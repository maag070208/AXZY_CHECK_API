import { prismaClient } from "@src/core/config/database";
import { AppError } from "@src/core/errors/app-error";
import { assertStatusUpdated, assertTransition, MAINTENANCE_TRANSITIONS } from "@src/core/transitions/transitions";
import { LIST_MAX_ROWS } from "@src/core/constants/limits";
import { USER_PUBLIC_SELECT } from "@src/core/constants/user-select";
import { ITDataTableFetchParams, ITDataTableResponse } from "@src/core/dto/datatable.dto";
import { getPrismaPaginationParams } from "@src/core/utils/prisma-pagination.utils";
import { Prisma } from "@prisma/client";
import { ClientScope, scopeByClient } from "@src/core/scope/client-scope";

/**
 * Multicliente (fase 5): `Maintenance` ya tiene `clientId` propio y es el cliente donde se creó el reporte, sin
 * importar quién lo creó. Antes se derivaba de la asignación del guardia, así que los reportes de ADMIN/MAINT se veían
 * en todos los clientes de la organización y los de un guardia cambiaban de cliente al moverlo de asignación. Sin
 * cliente en el alcance es 403. Los filtros de datatable/listados/detalle/resolución/borrado/media lo comparten.
 */
export const maintenanceScopeWhere = (scope: ClientScope | undefined): Prisma.MaintenanceWhereInput =>
    scopeByClient(scope);

export const getDataTableMaintenances = async (params: ITDataTableFetchParams, scope: ClientScope | undefined): Promise<ITDataTableResponse<any>> => {
    // Sin cliente en el alcance es 403, no una tabla vacía.
    const scoped = maintenanceScopeWhere(scope);
    const prismaParams = getPrismaPaginationParams(params);
    const where: Prisma.MaintenanceWhereInput = { ...prismaParams.where, ...scoped };

    const [rows, total] = await Promise.all([
        prismaClient.maintenance.findMany({
            ...prismaParams,
            where,
            include: { 
                guard: { select: USER_PUBLIC_SELECT },
                resolvedBy: { select: USER_PUBLIC_SELECT }
            },
        }),
        prismaClient.maintenance.count({ where })
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
    clientRef?: string;
    createdAt?: Date;
    createdOffline?: boolean;
    syncedAt?: Date;
}, scope: ClientScope | undefined) => {
    // El reporte pertenece al cliente del alcance (el elegido por ADMIN/MAINT o el de la asignación del guardia):
    // sin cliente no se permite (403).
    const { clientId } = scopeByClient(scope);
    if (data.clientRef) {
        const existing = await prismaClient.maintenance.findUnique({
            where: { clientRef: data.clientRef },
        });
        if (existing) {
            // Reintento offline de otro cliente: no se devuelve ni se reubica (no mezclar datos de clientes).
            if (existing.clientId !== clientId) {
                throw new AppError("CLIENT_REF_CONFLICT", "La clave de sincronización pertenece a otro registro.", 409);
            }
            return existing;
        }
    }

    const maintenance = await prismaClient.maintenance.create({
        data: {
            clientId,
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
            createdOffline: data.createdOffline ?? false,
            syncedAt: data.syncedAt,
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

export const getMaintenancesByGuard = async (guardId: number, scope: ClientScope | undefined) => {
    return prismaClient.maintenance.findMany({
        where: { guardId, ...scopeByClient(scope) },
        orderBy: { createdAt: 'desc' }
    });
};

export const getMaintenances = async (filters: {
    startDate?: Date;
    endDate?: Date;
    guardId?: number;
    category?: string;
    title?: string;
}, scope: ClientScope | undefined) => {
    const whereClause: any = { ...maintenanceScopeWhere(scope) };

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

export const resolveMaintenance = async (id: number, userId: number, scope: ClientScope | undefined) => {
    const current = await prismaClient.maintenance.findFirst({ where: { id, ...maintenanceScopeWhere(scope) }, select: { status: true } });
    if (!current) throw new AppError("MAINTENANCE_NOT_FOUND", "Reporte de mantenimiento no encontrado", 404);
    assertTransition(MAINTENANCE_TRANSITIONS, current.status, "ATTENDED");

    const { count } = await prismaClient.maintenance.updateMany({
        where: { id, status: current.status, ...maintenanceScopeWhere(scope) },
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

export const getPendingMaintenancesCount = async (scope: ClientScope | undefined) => {
    return prismaClient.maintenance.count({
        where: {
            ...maintenanceScopeWhere(scope),
            status: 'PENDING'
        }
    });
};

export const getMaintenanceById = async (id: number, scope: ClientScope | undefined) => {
    return prismaClient.maintenance.findFirst({
        where: { id, ...maintenanceScopeWhere(scope) },
        include: {
            guard: { select: USER_PUBLIC_SELECT },
            resolvedBy: { select: USER_PUBLIC_SELECT }
        }
    });
};

export const deleteMaintenance = async (id: number, scope: ClientScope | undefined) => {
    await getMaintenanceById(id, scope);
    return prismaClient.maintenance.delete({
        where: { id }
    });
};

export const updateMaintenanceMedia = async (id: number, media: any, scope: ClientScope | undefined) => {
    await getMaintenanceById(id, scope);
    return prismaClient.maintenance.update({
        where: { id },
        data: { media }
    });
};
