/**
 * Multicliente, fase 2 · reportes y dashboard: el cliente A no ve ni suma datos del cliente B.
 *
 * Organización COMPANY con dos clientes y datos en ambos (incidencias, casa club, rondas, kardex,
 * propiedades, cargos, invitaciones, accesos y avisos). El administrador elige cliente con
 * `X-Client-Id`; sin ese encabezado (organización con varios clientes) los endpoints de datos de
 * cliente responden 403. Los PDF solo se generan con las filas del cliente del alcance.
 */
import request from "supertest";
import { app } from "@src/app";
import { resetDatabase, disconnectDatabase, prisma } from "../setup/db";
import { buildOrganization, buildUser, tokenFor } from "../factories";

const V1 = "/api/v1";
/** Rango de fechas de los reportes de desempeño (el `guardReportQuery` acepta fechas ISO cortas). */
const RANGE = "startDate=2020-01-01&endDate=2999-12-31";
/** Rango de los PDF: el esquema exige datetime ISO completo. */
const PDF_QUERY = "startDate=2020-01-01T00:00:00.000Z&endDate=2999-12-31T23:59:59.000Z&includeImages=false&includeLocation=false";

beforeEach(async () => {
  await resetDatabase();
});

afterEach(() => {
  jest.restoreAllMocks();
});

afterAll(async () => {
  await disconnectDatabase();
});

const bearer = (user: Parameters<typeof tokenFor>[0]) => ({ Authorization: `Bearer ${tokenFor(user)}` });
/** ADMIN de la organización: el cliente lo elige con X-Client-Id (validado contra su organización). */
const asAdmin = (admin: Parameters<typeof tokenFor>[0], clientId: number) => ({ ...bearer(admin), "X-Client-Id": String(clientId) });

/** Catálogos base que exige `Property` (los siembra `resetDatabase`). */
const propertyCatalog = async () => {
  const [status, type, kind, occupancy] = await Promise.all([
    prisma.propertyStatus.findUniqueOrThrow({ where: { name: "HABIT" } }),
    prisma.propertyType.findUniqueOrThrow({ where: { name: "CASA" } }),
    prisma.propertyKind.findUniqueOrThrow({ where: { code: "HOUSE" } }),
    prisma.occupancyStatus.findUniqueOrThrow({ where: { code: "VACANT" } }),
  ]);
  return { statusId: status.id, typeId: type.id, kindId: kind.id, occupancyStatusId: occupancy.id };
};

const setup = async () => {
  const { organization, clients } = await buildOrganization("COMPANY", 2);
  const [a, b] = clients;
  const admin = await buildUser("ADMIN", { scope: { organizationId: organization.id, clientId: null } });
  const guardA = await buildUser("GUARD", { scope: { organizationId: organization.id, clientId: a.id } });
  const guardB = await buildUser("GUARD", { scope: { organizationId: organization.id, clientId: b.id } });
  // El dashboard solo lista al personal con sesión activa.
  await prisma.user.updateMany({ where: { id: { in: [guardA.id, guardB.id] } }, data: { isLoggedIn: true } });

  const locationA = await prisma.location.create({ data: { clientId: a.id, aisle: "A", spot: "1", number: "1", name: "Caseta Alfa" } });
  const locationB = await prisma.location.create({ data: { clientId: b.id, aisle: "B", spot: "1", number: "1", name: "Caseta Beta" } });
  const routeA = await prisma.recurringConfiguration.create({
    data: { clientId: a.id, title: "Ruta Alfa", guards: { connect: [{ id: guardA.id }] }, recurringLocations: { create: [{ locationId: locationA.id }] } },
  });
  const routeB = await prisma.recurringConfiguration.create({
    data: { clientId: b.id, title: "Ruta Beta", guards: { connect: [{ id: guardB.id }] }, recurringLocations: { create: [{ locationId: locationB.id }] } },
  });

  const started = new Date(Date.now() - 30 * 60_000);
  const roundA = await prisma.round.create({ data: { clientId: a.id, guardId: guardA.id, recurringConfigurationId: routeA.id, status: "IN_PROGRESS", startTime: started } });
  const roundB = await prisma.round.create({ data: { clientId: b.id, guardId: guardB.id, recurringConfigurationId: routeB.id, status: "IN_PROGRESS", startTime: started } });

  const media = [{ type: "IMAGE", url: "https://example.test/evidencia.jpg" }];
  const kardexA1 = await prisma.kardex.create({ data: { clientId: a.id, userId: guardA.id, locationId: locationA.id, notes: "Alfa 1", media, timestamp: new Date(Date.now() - 5 * 60_000) } });
  const kardexA2 = await prisma.kardex.create({ data: { clientId: a.id, userId: guardA.id, locationId: locationA.id, notes: "Alfa 2", media, timestamp: new Date(Date.now() - 4 * 60_000) } });
  const kardexB = await prisma.kardex.create({ data: { clientId: b.id, userId: guardB.id, locationId: locationB.id, notes: "Beta 1", media, timestamp: new Date(Date.now() - 5 * 60_000) } });

  // Incidencias abiertas: dos en A, una en B.
  const incidentA1 = await prisma.incident.create({ data: { clientId: a.id, guardId: guardA.id, kind: "INCIDENT", title: "Incidencia Alfa 1", status: "PENDING" } });
  const incidentA2 = await prisma.incident.create({ data: { clientId: a.id, guardId: guardA.id, kind: "INCIDENT", title: "Incidencia Alfa 2", status: "PENDING" } });
  const incidentB = await prisma.incident.create({ data: { clientId: b.id, guardId: guardB.id, kind: "INCIDENT", title: "Incidencia Beta", status: "PENDING" } });
  // Casa Club (misma tabla, otro `kind`): uno por cliente.
  const clubA = await prisma.incident.create({ data: { clientId: a.id, guardId: guardA.id, kind: "CASA_CLUB", title: "Club Alfa", status: "PENDING" } });
  const clubB = await prisma.incident.create({ data: { clientId: b.id, guardId: guardB.id, kind: "CASA_CLUB", title: "Club Beta", status: "PENDING" } });

  // Datos que cuelgan de la propiedad: propiedad, cargo, invitación, acceso y aviso en cada cliente.
  const catalog = await propertyCatalog();
  const propertyA = await prisma.property.create({ data: { ...catalog, clientId: a.id, identifier: "T4-ALFA-1", name: "Propiedad Alfa", mainStreet: "Calle Alfa" } });
  const propertyB = await prisma.property.create({ data: { ...catalog, clientId: b.id, identifier: "T4-BETA-1", name: "Propiedad Beta", mainStreet: "Calle Beta" } });

  const chargeA = await prisma.charge.create({ data: { propertyId: propertyA.id, residentId: admin.id, createdById: admin.id, concept: "Cuota Alfa", amount: 100, dueDate: new Date() } });
  const chargeB = await prisma.charge.create({ data: { propertyId: propertyB.id, residentId: admin.id, createdById: admin.id, concept: "Cuota Beta", amount: 200, dueDate: new Date() } });

  const visitor = await prisma.invitationType.findUniqueOrThrow({ where: { name: "VISITOR" } });
  const invitationA = await prisma.invitation.create({
    data: { code: "T4-INV-ALFA", guestName: "Visita Alfa", propertyId: propertyA.id, createdById: admin.id, typeId: visitor.id, validFrom: new Date(), validUntil: new Date(Date.now() + 3600_000) },
  });
  const invitationB = await prisma.invitation.create({
    data: { code: "T4-INV-BETA", guestName: "Visita Beta", propertyId: propertyB.id, createdById: admin.id, typeId: visitor.id, validFrom: new Date(), validUntil: new Date(Date.now() + 3600_000) },
  });

  const accessA = await prisma.accessEvent.create({ data: { propertyId: propertyA.id, guardId: guardA.id, method: "MANUAL", direction: "ENTRY", source: "GUARD", decision: "ALLOWED" } });
  const accessB = await prisma.accessEvent.create({ data: { propertyId: propertyB.id, guardId: guardB.id, method: "MANUAL", direction: "ENTRY", source: "GUARD", decision: "ALLOWED" } });

  const announcementA = await prisma.announcement.create({ data: { clientId: a.id, createdById: admin.id, title: "Aviso Alfa", body: "Solo Alfa", audience: "ALL" } });
  const announcementB = await prisma.announcement.create({ data: { clientId: b.id, createdById: admin.id, title: "Aviso Beta", body: "Solo Beta", audience: "ALL" } });

  return {
    a, b, admin, guardA, guardB,
    ids: { locationA, locationB, routeA, routeB, roundA, roundB, kardexA1, kardexA2, kardexB, incidentA1, incidentA2, incidentB, clubA, clubB, propertyA, propertyB, chargeA, chargeB, invitationA, invitationB, accessA, accessB, announcementA, announcementB },
    /** Texto exclusivo de cada cliente: no debe cruzarse en ninguna respuesta del otro. */
    markerA: "Alfa",
    markerB: "Beta",
  };
};

/** Los PDF se generan en streaming: se piden en binario y se comprueba que son PDF válidos. */
const fetchPdf = (path: string, headers: Record<string, string>, ids?: number[]) => {
  const extra = ids && ids.length > 0 ? `&ids=${ids.join(",")}` : "";
  return request(app)
    .get(`${V1}${path}?${PDF_QUERY}${extra}`)
    .set(headers)
    .buffer(true)
    .parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => cb(null, Buffer.concat(chunks)));
    });
};

describe("reportes de desempeño · aislamiento por cliente", () => {
  it("totales, comparativa y detalle solo suman el cliente elegido (y no cuentan datos sin cliente)", async () => {
    const { a, b, admin, guardA, guardB } = await setup();

    const statsA = (await request(app).get(`${V1}/reports/guards/stats?${RANGE}`).set(asAdmin(admin, a.id))).body.data;
    expect(statsA).toEqual({ totalIncidents: 2, totalScans: 2, incompleteRounds: 0, missedScans: 0 });
    const statsB = (await request(app).get(`${V1}/reports/guards/stats?${RANGE}`).set(asAdmin(admin, b.id))).body.data;
    expect(statsB).toEqual({ totalIncidents: 1, totalScans: 1, incompleteRounds: 0, missedScans: 0 });
    // La incidencia sin `clientId` no se cuela en ningún cliente.
    expect(statsA.totalIncidents + statsB.totalIncidents).toBe(3);

    const topA = (await request(app).get(`${V1}/reports/guards/top-performance?${RANGE}`).set(asAdmin(admin, a.id))).body.data;
    expect(topA.map((g: any) => g.guardId)).toEqual([guardA.id]);
    const topB = (await request(app).get(`${V1}/reports/guards/top-performance?${RANGE}`).set(asAdmin(admin, b.id))).body.data;
    expect(topB.map((g: any) => g.guardId)).toEqual([guardB.id]);

    const detailA = (await request(app).get(`${V1}/reports/guards/detail?${RANGE}`).set(asAdmin(admin, a.id))).body.data;
    expect(detailA.map((g: any) => g.guardId)).toEqual([guardA.id]);
    expect(detailA[0]).toMatchObject({ totalScans: 2, totalRounds: 1 });

    const workloadA = (await request(app).get(`${V1}/reports/guards/workload?${RANGE}`).set(asAdmin(admin, a.id))).body.data;
    expect(workloadA.map((g: any) => g.guardId)).toEqual([guardA.id]);
    expect(workloadA[0].details).toEqual({ scans: 2, reports: 2, rounds: 1 });

    // El desglose de un guardia de otro cliente no devuelve filas.
    const breakdown = (await request(app).get(`${V1}/reports/guards/detail-breakdown/${guardB.id}?${RANGE}`).set(asAdmin(admin, a.id))).body.data;
    expect(breakdown).toEqual({ missedPoints: [], incompleteRounds: [] });
  });

  it("la distribución y el desglose del guardia tampoco mezclan clientes", async () => {
    const { a, admin, guardA } = await setup();
    const distribution = (await request(app).get(`${V1}/reports/guards/distribution?${RANGE}`).set(asAdmin(admin, a.id))).body.data;
    expect(distribution).toEqual({ totalIncidents: 2, totalScans: 2, incompleteRounds: 0, missedScans: 0 });

    const breakdown = (await request(app).get(`${V1}/reports/guards/detail-breakdown/${guardA.id}?${RANGE}`).set(asAdmin(admin, a.id))).body.data;
    expect(breakdown.incompleteRounds).toEqual([]);
    expect(breakdown.missedPoints).toEqual([]);
  });
});

describe("reportes PDF · solo datos del cliente del alcance", () => {
  it("el PDF de incidencias recibe únicamente las incidencias del cliente elegido", async () => {
    const { a, admin, ids } = await setup();
    const service = await import("@src/modules/reports/incident-report.service");
    const spy = jest.spyOn(service, "getIncidentsForReport");

    const res = await fetchPdf("/reports/incidents/pdf", asAdmin(admin, a.id));
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/application\/pdf/);
    expect((res.body as Buffer).subarray(0, 4).toString()).toBe("%PDF");

    const items = await spy.mock.results[0].value;
    expect(items.map((i: any) => i.id).sort((x: number, y: number) => x - y)).toEqual([ids.incidentA1.id, ids.incidentA2.id].sort((x, y) => x - y));
    expect(JSON.stringify(items)).not.toContain("Incidencia Beta");
  });

  it("pedir por id una incidencia de otro cliente no la incluye en el PDF", async () => {
    const { a, admin, ids } = await setup();
    const service = await import("@src/modules/reports/incident-report.service");
    const spy = jest.spyOn(service, "getIncidentsForReport");

    const res = await fetchPdf("/reports/incidents/pdf", asAdmin(admin, a.id), [ids.incidentB.id]);
    expect(res.status).toBe(200);
    const items = await spy.mock.results[0].value;
    expect(items).toEqual([]);
  });

  it("el PDF de casa club usa el mismo cliente que el alcance", async () => {
    const { a, b, admin, ids } = await setup();
    const service = await import("@src/modules/reports/incident-report.service");
    const spy = jest.spyOn(service, "getIncidentsForReport");

    const resA = await fetchPdf("/reports/club/pdf", asAdmin(admin, a.id));
    expect(resA.status).toBe(200);
    const itemsA = await spy.mock.results[0].value;
    expect(itemsA.map((i: any) => i.id)).toEqual([ids.clubA.id]);

    const resB = await fetchPdf("/reports/club/pdf", asAdmin(admin, b.id));
    expect(resB.status).toBe(200);
    const itemsB = await spy.mock.results[1].value;
    expect(itemsB.map((i: any) => i.id)).toEqual([ids.clubB.id]);
  });
});

describe("dashboard en vivo · KPIs y alertas por cliente", () => {
  it("KPIs, rondas activas, personal de turno, rutas y alertas solo del cliente elegido", async () => {
    const { a, b, admin, guardA, guardB, markerA, markerB } = await setup();

    const liveA = (await request(app).get(`${V1}/dashboard/live`).set(asAdmin(admin, a.id))).body.data;
    expect(liveA.kpis).toEqual({ activeRoundsCount: 1, guardsOnShiftCount: 1, openIncidentsCount: 2, routesTotal: 1, routesCovered: 1 });
    expect(liveA.activeRounds.map((r: any) => r.guard.id)).toEqual([guardA.id]);
    expect(liveA.guardsOnShift.map((g: any) => g.guardId)).toEqual([guardA.id]);
    expect(liveA.uncoveredRoutes).toEqual([]);
    expect(liveA.insights.today.incidentsCreated).toBe(2);
    expect(liveA.alerts.filter((a: any) => a.type === "INCIDENT_OPEN")).toHaveLength(2);
    // Los datos de propiedad/cargo/invitación/acceso/aviso del otro cliente no aparecen.
    expect(JSON.stringify(liveA)).not.toContain(markerB);
    expect(JSON.stringify(liveA)).not.toContain("T4-BETA-1");
    expect(JSON.stringify(liveA)).not.toContain(guardB.name);

    const liveB = (await request(app).get(`${V1}/dashboard/live`).set(asAdmin(admin, b.id))).body.data;
    expect(liveB.kpis).toEqual({ activeRoundsCount: 1, guardsOnShiftCount: 1, openIncidentsCount: 1, routesTotal: 1, routesCovered: 1 });
    expect(liveB.activeRounds.map((r: any) => r.guard.id)).toEqual([guardB.id]);
    expect(liveB.alerts.filter((a: any) => a.type === "INCIDENT_OPEN")).toHaveLength(1);
    expect(JSON.stringify(liveB)).not.toContain(markerA);
    expect(JSON.stringify(liveB)).not.toContain("T4-ALFA-1");
    expect(JSON.stringify(liveB)).not.toContain(guardA.name);
  });
});

describe("sin cliente en el alcance", () => {
  it("reportes, PDF y dashboard responden 403 (no 500 ni datos de otro cliente)", async () => {
    const { admin } = await setup();
    const routes = [
      "/dashboard/live",
      `/reports/guards/stats?${RANGE}`,
      `/reports/guards/top-performance?${RANGE}`,
      `/reports/guards/detail?${RANGE}`,
      `/reports/guards/workload?${RANGE}`,
      `/reports/incidents/pdf?${PDF_QUERY}`,
      `/reports/club/pdf?${PDF_QUERY}`,
    ];
    for (const path of routes) {
      const res = await request(app).get(`${V1}${path}`).set(bearer(admin));
      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.data).toBeNull();
      expect(res.body.code).toBe("CLIENT_SCOPE_REQUIRED");
    }
  });
});
