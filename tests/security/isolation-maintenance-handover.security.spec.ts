/**
 * Multicliente, fase 5 · mantenimiento y entrega de turno: `Maintenance.clientId` y `ShiftHandover.clientId`
 * propios. El cliente A no ve ni toca datos del cliente B.
 *
 * Organización COMPANY con dos clientes. El administrador elige cliente con `X-Client-Id`; los guardias trabajan en
 * el cliente de su asignación. Un reporte de mantenimiento nace en el cliente del alcance (también si lo crea
 * ADMIN/MAINT) y la entrega de turno es única por turno+fecha DENTRO de cada cliente.
 */
import request from "supertest";
import { app } from "@src/app";
import { clearSettingsCache } from "@src/core/settings/app-settings.service";
import { resetDatabase, disconnectDatabase, prisma } from "../setup/db";
import { buildOrganization, buildUser, tokenFor } from "../factories";

const V1 = "/api/v1";
/** Rango de los PDF: el esquema exige datetime ISO completo. */
const PDF_QUERY = "startDate=2020-01-01T00:00:00.000Z&endDate=2999-12-31T23:59:59.000Z&includeImages=false&includeLocation=false";

beforeEach(async () => {
  await resetDatabase();
  clearSettingsCache();
});

afterEach(() => {
  jest.restoreAllMocks();
});

afterAll(async () => {
  await disconnectDatabase();
});

const bearer = (user: Parameters<typeof tokenFor>[0]) => ({ Authorization: `Bearer ${tokenFor(user)}` });
/** Usuario de organización: el cliente lo elige con X-Client-Id (validado contra su organización). */
const asClient = (user: Parameters<typeof tokenFor>[0], clientId: number) => ({
  ...bearer(user),
  "X-Client-Id": String(clientId),
});

const setup = async () => {
  const { organization, clients } = await buildOrganization("COMPANY", 2);
  const [a, b] = clients;
  const admin = await buildUser("ADMIN", { scope: { organizationId: organization.id, clientId: null } });
  const maint = await buildUser("MAINT", { scope: { organizationId: organization.id, clientId: null } });
  const guardA = await buildUser("GUARD", { scope: { organizationId: organization.id, clientId: a.id } });
  const guardB = await buildUser("GUARD", { scope: { organizationId: organization.id, clientId: b.id } });
  const shiftA = await buildUser("SHIFT", { scope: { organizationId: organization.id, clientId: a.id } });
  const asAdmin = (clientId: number) => asClient(admin, clientId);
  return { a, b, admin, maint, guardA, guardB, shiftA, asAdmin };
};

const maintenanceBody = (title: string, extra: Record<string, unknown> = {}) => ({ title, ...extra });

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

describe("mantenimiento · aislamiento por cliente", () => {
  it("el reporte del guardia de A queda en A; desde B no se ve, resuelve, borra ni quita evidencia", async () => {
    const { a, b, guardA, asAdmin } = await setup();

    const created = await request(app)
      .post(`${V1}/maintenance`)
      .set(bearer(guardA))
      .send(maintenanceBody("Fuga del cliente A", { clientRef: "mant-a", media: [{ type: "IMAGE", url: "https://example.test/a.jpg", key: "a" }] }));
    expect(created.status).toBe(201);
    const maintenanceId = created.body.data.id;
    expect((await prisma.maintenance.findUniqueOrThrow({ where: { id: maintenanceId } })).clientId).toBe(a.id);

    expect((await request(app).get(`${V1}/maintenance`).set(asAdmin(a.id))).body.data.map((m: any) => m.id)).toEqual([maintenanceId]);
    expect((await request(app).get(`${V1}/maintenance`).set(asAdmin(b.id))).body.data).toEqual([]);
    expect((await request(app).post(`${V1}/maintenance/datatable`).set(asAdmin(b.id)).send({ page: 1, limit: 10 })).body.data).toMatchObject({
      rows: [],
      total: 0,
    });

    const external = asAdmin(b.id);
    expect((await request(app).get(`${V1}/maintenance/${maintenanceId}`).set(external)).status).toBe(404);
    expect((await request(app).put(`${V1}/maintenance/${maintenanceId}/resolve`).set(external).send({})).status).toBe(404);
    expect((await request(app).delete(`${V1}/maintenance/${maintenanceId}`).set(external)).status).toBe(404);
    expect((await request(app).delete(`${V1}/maintenance/${maintenanceId}/media`).query({ key: "a" }).set(external)).status).toBe(404);

    const untouched = await prisma.maintenance.findUniqueOrThrow({ where: { id: maintenanceId } });
    expect(untouched.status).toBe("PENDING");
    expect(untouched.media).toEqual([{ type: "IMAGE", url: "https://example.test/a.jpg", key: "a" }]);

    expect((await request(app).put(`${V1}/maintenance/${maintenanceId}/resolve`).set(asAdmin(a.id)).send({})).status).toBe(200);
  });

  it("ADMIN y MAINT crean en el cliente elegido, y el reporte no aparece en el otro cliente", async () => {
    const { a, b, admin, maint, asAdmin } = await setup();

    const byAdminB = await request(app).post(`${V1}/maintenance`).set(asAdmin(b.id)).send(maintenanceBody("Fuga creada por ADMIN en B"));
    expect(byAdminB.status).toBe(201);
    expect((await prisma.maintenance.findUniqueOrThrow({ where: { id: byAdminB.body.data.id } })).clientId).toBe(b.id);

    const byMaintA = await request(app).post(`${V1}/maintenance`).set(asClient(maint, a.id)).send(maintenanceBody("Fuga creada por MAINT en A"));
    expect(byMaintA.status).toBe(201);
    expect((await prisma.maintenance.findUniqueOrThrow({ where: { id: byMaintA.body.data.id } })).clientId).toBe(a.id);

    expect((await request(app).get(`${V1}/maintenance`).set(asAdmin(a.id))).body.data.map((m: any) => m.title)).toEqual(["Fuga creada por MAINT en A"]);
    expect((await request(app).get(`${V1}/maintenance`).set(asAdmin(b.id))).body.data.map((m: any) => m.title)).toEqual(["Fuga creada por ADMIN en B"]);

    // El reporte de ADMIN ya no se ve desde el otro cliente: solo se cuenta en el que se creó.
    expect((await request(app).get(`${V1}/maintenance/pending-count`).set(asAdmin(a.id))).body.data).toEqual({ count: 1 });
    expect((await request(app).get(`${V1}/maintenance/pending-count`).set(asAdmin(b.id))).body.data).toEqual({ count: 1 });
    expect((await request(app).get(`${V1}/maintenance`).set(bearer(admin))).status).toBe(403);
  });

  it("reintento offline con la clave de un reporte de A desde B: 409, sin devolver el de A", async () => {
    const { guardA, guardB } = await setup();

    const first = await request(app).post(`${V1}/maintenance`).set(bearer(guardA)).send(maintenanceBody("Reporte de A", { clientRef: "maint-offline-a" }));
    expect(first.status).toBe(201);

    const retry = await request(app).post(`${V1}/maintenance`).set(bearer(guardB)).send(maintenanceBody("Reporte de B", { clientRef: "maint-offline-a" }));
    expect(retry.status).toBe(409);
    expect(retry.body.code).toBe("CLIENT_REF_CONFLICT");
    expect(JSON.stringify(retry.body)).not.toContain("Reporte de A");
    expect(await prisma.maintenance.count({ where: { clientRef: "maint-offline-a" } })).toBe(1);
  });

  it("el PDF de mantenimientos solo incluye las filas del cliente elegido", async () => {
    const { a, b, guardA, guardB, asAdmin } = await setup();
    const service = await import("@src/modules/maintenance/maintenance-report.service");
    const spy = jest.spyOn(service, "getMaintenancesForReport");

    const maintenanceA = await prisma.maintenance.create({ data: { clientId: a.id, guardId: guardA.id, title: "Fuga Alfa" } });
    const maintenanceB = await prisma.maintenance.create({ data: { clientId: b.id, guardId: guardB.id, title: "Fuga Beta" } });

    const pdfA = await fetchPdf("/maintenance/report/pdf", asAdmin(a.id));
    expect(pdfA.status).toBe(200);
    expect((pdfA.body as Buffer).subarray(0, 4).toString()).toBe("%PDF");
    const itemsA = (await spy.mock.results[0].value) as Array<{ id: number }>;
    expect(itemsA.map((m) => m.id)).toEqual([maintenanceA.id]);

    // Pedir por id una fila de B desde A no la incluye.
    const pdfWithExternalId = await fetchPdf("/maintenance/report/pdf", asAdmin(a.id), [maintenanceB.id]);
    expect(pdfWithExternalId.status).toBe(200);
    expect(await spy.mock.results[1].value).toEqual([]);
  });
});

describe("entrega de turno · aislamiento por cliente", () => {
  const handoverBody = (over: Record<string, unknown> = {}) => ({
    shiftType: "MATUTINO",
    handoverDate: "2026-02-10",
    reportedToAdmin: true,
    elements: [],
    ...over,
  });

  it("listado, datatable y detalle solo del cliente elegido; de otro cliente 404", async () => {
    const { a, b, shiftA, asAdmin } = await setup();

    const handoverA = await request(app).post(`${V1}/shift-handover`).set(bearer(shiftA)).send(handoverBody());
    expect(handoverA.status).toBe(201);
    const handoverB = await request(app)
      .post(`${V1}/shift-handover`)
      .set(asAdmin(b.id))
      .send(handoverBody({ shiftType: "NOCTURNO" }));
    expect(handoverB.status).toBe(201);
    expect((await prisma.shiftHandover.findUniqueOrThrow({ where: { id: handoverA.body.data.id } })).clientId).toBe(a.id);
    expect((await prisma.shiftHandover.findUniqueOrThrow({ where: { id: handoverB.body.data.id } })).clientId).toBe(b.id);

    const tableA = await request(app).post(`${V1}/shift-handover/datatable`).set(asAdmin(a.id)).send({ page: 1, limit: 10, filters: {} });
    expect(tableA.body.data.rows.map((h: any) => h.id)).toEqual([handoverA.body.data.id]);
    const tableB = await request(app).post(`${V1}/shift-handover/datatable`).set(asAdmin(b.id)).send({ page: 1, limit: 10, filters: {} });
    expect(tableB.body.data.rows.map((h: any) => h.id)).toEqual([handoverB.body.data.id]);

    expect((await request(app).get(`${V1}/shift-handover/${handoverA.body.data.id}`).set(asAdmin(a.id))).status).toBe(200);
    expect((await request(app).get(`${V1}/shift-handover/${handoverA.body.data.id}`).set(asAdmin(b.id))).status).toBe(404);
  });

  it("el mismo turno y fecha se permite en clientes distintos, pero solo una vez por cliente", async () => {
    const { a, b, asAdmin } = await setup();

    const inA = await request(app).post(`${V1}/shift-handover`).set(asAdmin(a.id)).send(handoverBody());
    expect(inA.status).toBe(201);
    const inB = await request(app).post(`${V1}/shift-handover`).set(asAdmin(b.id)).send(handoverBody());
    expect(inB.status).toBe(201);
    expect((await prisma.shiftHandover.findUniqueOrThrow({ where: { id: inB.body.data.id } })).clientId).toBe(b.id);

    const duplicateA = await request(app).post(`${V1}/shift-handover`).set(asAdmin(a.id)).send(handoverBody());
    expect(duplicateA.status).toBe(400);
    expect(duplicateA.body.messages.join(" ")).toMatch(/Ya existe un reporte/);
    expect(await prisma.shiftHandover.count()).toBe(2);
  });

  it("no se puede mencionar a un guardia de otro cliente (400)", async () => {
    const { b, guardA, asAdmin } = await setup();
    const res = await request(app)
      .post(`${V1}/shift-handover`)
      .set(asAdmin(b.id))
      .send(handoverBody({ elements: [{ guardId: guardA.id, entryTime: "06:55" }] }));
    expect(res.status).toBe(400);
    expect(await prisma.shiftHandover.count()).toBe(0);
  });

  it("ADMIN y SHIFT crean en el cliente elegido", async () => {
    const { a, b, guardA, shiftA, asAdmin } = await setup();

    const byAdminA = await request(app).post(`${V1}/shift-handover`).set(asAdmin(a.id)).send(handoverBody({ shiftType: "NOCTURNO" }));
    expect(byAdminA.status).toBe(201);
    expect((await prisma.shiftHandover.findUniqueOrThrow({ where: { id: byAdminA.body.data.id } })).clientId).toBe(a.id);

    const byShiftA = await request(app)
      .post(`${V1}/shift-handover`)
      .set(bearer(shiftA))
      .send(handoverBody({ handoverDate: "2026-02-11", elements: [{ guardId: guardA.id, entryTime: "06:55" }] }));
    expect(byShiftA.status).toBe(201);
    expect((await prisma.shiftHandover.findUniqueOrThrow({ where: { id: byShiftA.body.data.id } })).clientId).toBe(a.id);

    const byAdminB = await request(app).post(`${V1}/shift-handover`).set(asAdmin(b.id)).send(handoverBody({ shiftType: "NOCTURNO" }));
    expect(byAdminB.status).toBe(201);
    expect((await prisma.shiftHandover.findUniqueOrThrow({ where: { id: byAdminB.body.data.id } })).clientId).toBe(b.id);
  });

  it("pendiente y alerta del dashboard se evalúan por cliente", async () => {
    const { a, b, asAdmin } = await setup();
    // Las dos alertas del día ya pasaron: queda pendiente el turno que toca según la hora.
    for (const [key, value] of [
      ["SHIFT_ALERT_MORNING_TIME", "00:00"],
      ["SHIFT_ALERT_EVENING_TIME", "00:00"],
    ]) {
      await prisma.appSetting.upsert({ where: { key }, update: { value }, create: { key, value, valueType: "string", group: "turnos" } });
    }
    clearSettingsCache();

    const initial = (await request(app).get(`${V1}/shift-handover/pending`).set(asAdmin(a.id))).body.data;
    expect(initial.pending).toBe(true);
    const today = initial.date;

    // Se entrega en A: A deja de estar pendiente, B sigue pendiente (no hay fila de B para ese turno/fecha).
    const delivered = await request(app)
      .post(`${V1}/shift-handover`)
      .set(asAdmin(a.id))
      .send(handoverBody({ shiftType: initial.shiftType, handoverDate: today }));
    expect(delivered.status).toBe(201);

    expect((await request(app).get(`${V1}/shift-handover/pending`).set(asAdmin(a.id))).body.data).toMatchObject({ pending: false, shiftType: initial.shiftType });
    expect((await request(app).get(`${V1}/shift-handover/pending`).set(asAdmin(b.id))).body.data).toMatchObject({ pending: true, shiftType: initial.shiftType });

    const liveA = (await request(app).get(`${V1}/dashboard/live`).set(asAdmin(a.id))).body.data;
    expect(liveA.alerts.map((alert: any) => alert.type)).not.toContain("SHIFT_HANDOVER_OVERDUE");
    const liveB = (await request(app).get(`${V1}/dashboard/live`).set(asAdmin(b.id))).body.data;
    expect(liveB.alerts.map((alert: any) => alert.type)).toContain("SHIFT_HANDOVER_OVERDUE");
  });
});

describe("mantenimiento y entrega de turno · sin cliente en el alcance", () => {
  it("responden 403 (no 500) cuando la organización tiene varios clientes y no se eligió ninguno", async () => {
    const { admin } = await setup();
    const auth = bearer(admin);

    const requests = [
      request(app).get(`${V1}/maintenance`).set(auth),
      request(app).post(`${V1}/maintenance/datatable`).set(auth).send({ page: 1, limit: 10 }),
      request(app).post(`${V1}/maintenance`).set(auth).send(maintenanceBody("Sin cliente")),
      request(app).get(`${V1}/maintenance/pending-count`).set(auth),
      request(app).get(`${V1}/maintenance/report/pdf?${PDF_QUERY}`).set(auth),
      request(app).get(`${V1}/shift-handover/pending`).set(auth),
      request(app).post(`${V1}/shift-handover/datatable`).set(auth).send({ page: 1, limit: 10 }),
      request(app).post(`${V1}/shift-handover`).set(auth).send({
        shiftType: "MATUTINO",
        handoverDate: "2026-02-10",
        reportedToAdmin: true,
        elements: [],
      }),
    ];

    for (const res of await Promise.all(requests)) {
      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.data).toBeNull();
      expect(res.body.code).toBe("CLIENT_SCOPE_REQUIRED");
    }
    expect(await prisma.maintenance.count()).toBe(0);
    expect(await prisma.shiftHandover.count()).toBe(0);
  });
});
