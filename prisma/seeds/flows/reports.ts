import { PrismaClient } from "@prisma/client";
import { StaffIds } from "./staff";
import { locationsFlow } from "./locations";

export interface ReportIds {
  pendingIncidentId: number;
  attendedIncidentId: number;
  clubReportId: number;
  pendingMaintenanceId: number;
  kardexId: number;
}

const photo = (name: string) => [{ type: "IMAGE", url: `https://example.test/flujo/${name}.jpg`, key: `flujo/${name}.jpg` }];

/**
 * Flujo "reportes": una incidencia pendiente, otra atendida, un reporte de Casa Club,
 * un reporte de mantenimiento pendiente y una bitácora (kardex) con foto.
 * Requiere los catálogos de incidencias, club y mantenimiento. Idempotente por título.
 */
export const reportsFlow = async (prisma: PrismaClient, staff: StaffIds): Promise<ReportIds> => {
  const security = await prisma.incidentCategory.findUniqueOrThrow({ where: { name: "SEGURIDAD" } });
  const robbery = await prisma.incidentType.findUniqueOrThrow({ where: { name: "ROBO" } });
  const clubCategory = await prisma.incidentCategory.findUniqueOrThrow({ where: { name: "CASA_CLUB" } });
  const clubType = await prisma.incidentType.findUniqueOrThrow({ where: { name: "ACCESO_PERMITIDO" } });
  const [pointId] = await locationsFlow(prisma);

  const ensureIncident = async (title: string, data: Record<string, unknown>) =>
    (await prisma.incident.findFirst({ where: { title } })) ?? prisma.incident.create({ data: { title, guardId: staff.guard1, ...data } as any });

  const pending = await ensureIncident("Flujo · Puerta abierta de madrugada", {
    categoryId: security.id, typeId: robbery.id, description: "Se encontró la puerta lateral sin seguro", media: photo("incidencia-1"),
  });
  const attended = await ensureIncident("Flujo · Ruido en área común", {
    categoryId: security.id, description: "Se pidió a los vecinos bajar el volumen",
    status: "ATTENDED", resolvedAt: new Date(), resolvedById: staff.shift,
  });
  const club = await ensureIncident("Flujo · Acceso a casa club con invitado", {
    kind: "CASA_CLUB", categoryId: clubCategory.id, typeId: clubType.id, description: "Residente con un invitado", clientRef: "flujo-club-1",
  });

  const maintenance =
    (await prisma.maintenance.findFirst({ where: { title: "Flujo · Luminaria fundida" } })) ??
    (await prisma.maintenance.create({
      data: { title: "Flujo · Luminaria fundida", guardId: staff.guard1, category: "Eléctrico", description: "Poste 4 sin luz", media: photo("mantenimiento-1") },
    }));

  const kardex =
    (await prisma.kardex.findFirst({ where: { userId: staff.guard1, notes: "Flujo · punto revisado" } })) ??
    (await prisma.kardex.create({
      data: { userId: staff.guard1, locationId: pointId, notes: "Flujo · punto revisado", media: photo("kardex-1"), latitude: 32.5, longitude: -117.0 },
    }));

  return {
    pendingIncidentId: pending.id, attendedIncidentId: attended.id, clubReportId: club.id,
    pendingMaintenanceId: maintenance.id, kardexId: kardex.id,
  };
};
