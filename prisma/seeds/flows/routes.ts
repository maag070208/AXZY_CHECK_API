import { PrismaClient } from "@prisma/client";
import { FLOW_ROUTE_TITLE } from "./constants";
import { locationsFlow } from "./locations";
import { StaffIds } from "./staff";

export interface RouteIds {
  configurationId: number;
  locationIds: number[];
  completedRoundId: number;
  assignmentId: number;
}

/**
 * Flujo "rondas": una ruta recurrente con tres puntos y tareas, asignada a los dos
 * guardias; una ronda ya terminada del guardia 1 con sus escaneos con foto, y una
 * asignación puntual pendiente. Idempotente por título de ruta.
 */
export const routesFlow = async (prisma: PrismaClient, staff: StaffIds): Promise<RouteIds> => {
  const locationIds = await locationsFlow(prisma);
  const [p1, p2, p3, p4] = locationIds;

  let config = await prisma.recurringConfiguration.findFirst({ where: { title: FLOW_ROUTE_TITLE } });
  if (!config) {
    config = await prisma.recurringConfiguration.create({
      data: {
        title: FLOW_ROUTE_TITLE,
        description: "Recorrido de prueba por accesos, alberca y jardín",
        guards: { connect: [{ id: staff.guard1 }, { id: staff.guard2 }] },
        recurringLocations: {
          create: [p1, p2, p3].map((locationId) => ({
            locationId,
            tasks: { create: [{ description: "Verificar candados", reqPhoto: true }, { description: "Revisar iluminación", reqPhoto: false }] },
          })),
        },
      },
    });
  }

  let round = await prisma.round.findFirst({ where: { recurringConfigurationId: config.id, status: "COMPLETED" } });
  if (!round) {
    const end = new Date(Date.now() - 2 * 3600_000);
    const start = new Date(end.getTime() - 45 * 60_000);
    round = await prisma.round.create({
      data: { guardId: staff.guard1, recurringConfigurationId: config.id, status: "COMPLETED", startTime: start, endTime: end },
    });
    await prisma.kardex.createMany({
      data: [p1, p2].map((locationId, i) => ({
        userId: staff.guard1,
        locationId,
        scanType: "RECURRING" as const,
        notes: "Punto sin novedad",
        media: [{ type: "IMAGE", url: `https://example.test/flujo/ronda-${i + 1}.jpg`, key: `flujo/ronda-${i + 1}.jpg` }],
        timestamp: new Date(start.getTime() + (i + 1) * 10 * 60_000),
      })),
    });
  }

  let assignment = await prisma.assignment.findFirst({ where: { guardId: staff.guard2, locationId: p4, notes: "Flujo · revisión puntual" } });
  if (!assignment) {
    assignment = await prisma.assignment.create({
      data: {
        guardId: staff.guard2,
        locationId: p4,
        assignedBy: staff.shift,
        notes: "Flujo · revisión puntual",
        tasks: { create: [{ description: "Revisar riego", reqPhoto: true }] },
      },
    });
  }

  return { configurationId: config.id, locationIds, completedRoundId: round.id, assignmentId: assignment.id };
};
