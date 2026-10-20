/**
 * [T-F0-13] Enums → catálogos con doble escritura. Invariante: en cada fila, la
 * FK del catálogo apunta al mismo valor que la columna enum (conteo por valor igual).
 */
import { AssignmentStatus, IncidentStatus, InvitationStatus, MaintenanceStatus, RoundStatus, ScanType } from "@prisma/client";
import { resetDatabase, disconnectDatabase, prisma } from "../setup/db";
import { buildUser } from "../factories";

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await disconnectDatabase();
});

const MAPPINGS = [
  { table: "Assignment", col: "status", fk: "statusId", catalog: "AssignmentStatusCatalog", values: Object.values(AssignmentStatus) },
  { table: "Invitation", col: "status", fk: "statusId", catalog: "InvitationStatusCatalog", values: Object.values(InvitationStatus) },
  { table: "Kardex", col: "scanType", fk: "scanTypeId", catalog: "ScanTypeCatalog", values: Object.values(ScanType) },
  { table: "Incident", col: "status", fk: "statusId", catalog: "IncidentStatusCatalog", values: Object.values(IncidentStatus) },
  { table: "Round", col: "status", fk: "statusId", catalog: "RoundStatusCatalog", values: Object.values(RoundStatus) },
  { table: "Maintenance", col: "status", fk: "statusId", catalog: "MaintenanceStatusCatalog", values: Object.values(MaintenanceStatus) },
] as const;

/** Filas donde la FK no coincide con el catálogo del valor enum. Debe ser 0. */
const unmapped = async (m: (typeof MAPPINGS)[number]) => {
  const rows = await prisma.$queryRawUnsafe<{ n: number }[]>(
    `SELECT COUNT(*)::int AS n FROM "${m.table}" t LEFT JOIN "${m.catalog}" c ON c."name" = t."${m.col}"::text WHERE t."${m.fk}" IS DISTINCT FROM c."id"`,
  );
  return rows[0].n;
};

describe("catálogos sembrados", () => {
  it.each(MAPPINGS)("$catalog contiene exactamente los valores del enum", async (m) => {
    const names = (await (prisma as any)[m.catalog[0].toLowerCase() + m.catalog.slice(1)].findMany({ select: { name: true } }))
      .map((r: { name: string }) => r.name)
      .sort();
    expect(names).toEqual([...m.values].sort());
  });
});

describe("doble escritura", () => {
  it("un INSERT y un UPDATE mantienen la FK alineada con la columna enum", async () => {
    const guard = await buildUser("GUARD");
    const location = await prisma.location.create({ data: { aisle: "A", spot: "1", number: "1", name: "Ubicación prueba" } });
    const admin = await buildUser("ADMIN");
    const assignment = await prisma.assignment.create({ data: { guardId: guard.id, locationId: location.id, assignedBy: admin.id } });
    await prisma.kardex.create({ data: { userId: guard.id, locationId: location.id, scanType: "RECURRING" } });
    await prisma.round.create({ data: { guardId: guard.id, status: "COMPLETED" } });
    await prisma.incident.create({ data: { guardId: guard.id, title: "Prueba" } });
    await prisma.maintenance.create({ data: { guardId: guard.id, title: "Prueba" } });
    await prisma.assignment.update({ where: { id: assignment.id }, data: { status: "REVIEWED" } });

    const fromRow = await prisma.assignment.findUniqueOrThrow({
      where: { id: assignment.id },
      include: { assignmentStatusCatalog: true },
    });
    expect(fromRow.assignmentStatusCatalog?.name).toBe("REVIEWED");

    for (const m of MAPPINGS) {
      expect(await unmapped(m)).toBe(0);
    }
  });

  it("una fila con estado cambiado varias veces termina con la FK del último valor", async () => {
    const guard = await buildUser("GUARD");
    const incident = await prisma.incident.create({ data: { guardId: guard.id, title: "Prueba" } });
    await prisma.incident.update({ where: { id: incident.id }, data: { status: "ATTENDED" } });
    await prisma.incident.update({ where: { id: incident.id }, data: { status: "PENDING" } });

    const row = await prisma.incident.findUniqueOrThrow({ where: { id: incident.id }, include: { incidentStatusCatalog: true } });
    expect(row.incidentStatusCatalog?.name).toBe("PENDING");
  });
});
