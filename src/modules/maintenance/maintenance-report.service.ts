import { prismaClient } from "@src/core/config/database";

/**
 * @description Servicio para construir el dataset que alimenta el reporte PDF
 * de mantenimientos. Aplica los filtros de fecha y opcionalmente restringe
 * por IDs específicos seleccionados desde la UI.
 */
export const getMaintenancesForReport = async (params: {
    startDate: Date;
    endDate: Date;
    ids?: number[];
}) => {
    const { startDate, endDate, ids } = params;

    const rangeStart = new Date(startDate);
    rangeStart.setHours(0, 0, 0, 0);
    const rangeEnd = new Date(endDate);
    rangeEnd.setHours(23, 59, 59, 999);

    const whereClause: {
        createdAt: { gte: Date; lte: Date };
        id?: { in: number[] };
    } = {
        createdAt: { gte: rangeStart, lte: rangeEnd },
    };

    if (ids && ids.length > 0) {
        whereClause.id = { in: ids };
    }

    const maintenances = await prismaClient.maintenance.findMany({
        where: whereClause,
        orderBy: { createdAt: "desc" },
        include: {
            guard: { select: { name: true, lastName: true, username: true } },
            resolvedBy: { select: { name: true, lastName: true } },
            categoryRel: { select: { value: true } },
            type: { select: { value: true } },
        },
    });

    return maintenances.map((m) => {
        const guardFullName = [m.guard?.name, m.guard?.lastName]
            .filter(Boolean)
            .join(" ")
            .trim();

        const resolvedByName = m.resolvedBy
            ? [m.resolvedBy.name, m.resolvedBy.lastName]
                .filter(Boolean)
                .join(" ")
                .trim()
            : null;

        const mediaRaw = Array.isArray(m.media) ? (m.media as unknown[]) : [];
        const media = mediaRaw
            .filter((x): x is { type?: string; url?: string; key?: string } => !!x && typeof x === "object")
            .map((x) => ({
                type: (x.type === "VIDEO" ? "VIDEO" : "IMAGE") as "VIDEO" | "IMAGE",
                url: String(x.url ?? ""),
                key: x.key ? String(x.key) : undefined,
            }))
            .filter((x) => x.url.length > 0);

        return {
            id: m.id,
            title: m.title,
            description: m.description ?? null,
            status: m.status,
            createdAt: m.createdAt,
            resolvedAt: m.resolvedAt,
            resolvedByName,
            guardName: guardFullName || "Sin asignar",
            guardUsername: m.guard?.username ?? "N/A",
            categoryName: m.categoryRel?.value ?? m.category ?? null,
            typeName: m.type?.value ?? null,
            latitude: m.latitude ?? null,
            longitude: m.longitude ?? null,
            media,
        };
    });
};
