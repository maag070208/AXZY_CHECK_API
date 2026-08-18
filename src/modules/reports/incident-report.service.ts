import { prismaClient } from "@src/core/config/database";
import { IncidentMediaItem, IncidentReportItem } from "./incident-report.dto";

/**
 * @description Servicio para construir el dataset que alimenta el reporte PDF de
 * incidencias. Aplica los filtros de fecha y opcionalmente restringe por IDs
 * específicos seleccionados desde la UI.
 */
export const getIncidentsForReport = async (params: {
    startDate: Date;
    endDate: Date;
    ids?: number[];
}): Promise<IncidentReportItem[]> => {
    const { startDate, endDate, ids } = params;

    // Ajuste de rango: cubrir día completo para endDate
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

    const incidents = await prismaClient.incident.findMany({
        where: whereClause,
        orderBy: { createdAt: "desc" },
        include: {
            guard: { select: { name: true, lastName: true, username: true } },
            resolvedBy: { select: { name: true, lastName: true } },
            category: { select: { value: true } },
            type: { select: { value: true } },
        },
    });

    return incidents.map((incident) => {
        const guardFullName = [incident.guard?.name, incident.guard?.lastName]
            .filter(Boolean)
            .join(" ")
            .trim();

        const resolvedByName = incident.resolvedBy
            ? [incident.resolvedBy.name, incident.resolvedBy.lastName]
                .filter(Boolean)
                .join(" ")
                .trim()
            : null;

        const mediaRaw = Array.isArray(incident.media) ? (incident.media as unknown[]) : [];
        const media: IncidentMediaItem[] = mediaRaw
            .filter((m): m is { type?: string; url?: string; key?: string } => !!m && typeof m === "object")
            .map((m) => ({
                type: (m.type === "VIDEO" ? "VIDEO" : "IMAGE") as IncidentMediaItem["type"],
                url: String(m.url ?? ""),
                key: m.key ? String(m.key) : undefined,
            }))
            .filter((m) => m.url.length > 0);

        return {
            id: incident.id,
            title: incident.title,
            description: incident.description ?? null,
            status: incident.status,
            createdAt: incident.createdAt,
            resolvedAt: incident.resolvedAt,
            resolvedByName,
            guardName: guardFullName || "Sin asignar",
            guardUsername: incident.guard?.username ?? "N/A",
            categoryName: incident.category?.value ?? null,
            typeName: incident.type?.value ?? null,
            latitude: incident.latitude ?? null,
            longitude: incident.longitude ?? null,
            media,
        };
    });
};
