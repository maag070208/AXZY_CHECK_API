/**
 * Flujo de reportes de campo: incidencias, casa club y mantenimiento.
 * Los tres siguen el mismo ciclo (crear → listar → atender → quitar evidencia → borrar) pero
 * cada uno con su rol responsable, así que se prueban con una tabla de variantes.
 */
import { api, allSessions, bootFlows, disconnectDatabase, expectFail, expectOk, MISSING_ID, prisma, Session, V1 } from "./support";
import { FlowsResult } from "../../prisma/seeds/flows";

let flows: FlowsResult;
let s: Record<string, Session>;

beforeEach(async () => {
  flows = await bootFlows();
  s = await allSessions();
});
afterAll(disconnectDatabase);

const media = [
  { type: "IMAGE", url: "https://example.test/a/uno.jpg", key: "a/uno.jpg" },
  { type: "VIDEO", url: "https://example.test/a/dos.mp4", key: "a/dos.mp4" },
];

interface Variant {
  name: string;
  base: string;
  /** Roles que atienden/borran. */
  managers: string[];
  others: string[];
  pendingId: () => number;
  attendedId?: () => number;
  body: () => Record<string, unknown>;
  countBefore: number;
}

const variants = (): Variant[] => [
  {
    name: "incidencias", base: `${V1}/incidents`, managers: ["admin", "shift"], others: ["guard1", "maint", "resident"],
    pendingId: () => flows.reports.pendingIncidentId, attendedId: () => flows.reports.attendedIncidentId, countBefore: 1,
    body: () => ({ title: "Persona sospechosa en acceso", description: "Merodea desde hace 20 min", media, latitude: 32.5, longitude: "-117.01" }),
  },
  {
    name: "casa club", base: `${V1}/club`, managers: ["admin", "shift"], others: ["guard1", "maint", "resident"],
    pendingId: () => flows.reports.clubReportId, countBefore: 1,
    body: () => ({ title: "Acceso con invitados", description: "Ingresó con 3 personas", media, latitude: "", longitude: null }),
  },
  {
    name: "mantenimiento", base: `${V1}/maintenance`, managers: ["admin", "maint"], others: ["shift", "guard1", "resident"],
    pendingId: () => flows.reports.pendingMaintenanceId, countBefore: 1,
    body: () => ({ title: "Fuga en cisterna", category: "Plomería", description: "Charco junto a la bomba", media }),
  },
];

describe.each(variants().map((v) => v.name))("%s", (name) => {
  const v = (): Variant => variants().find((x) => x.name === name)!;

  it("camino feliz: crear → listar → datatable → pendientes → atender → quitar evidencia → borrar", async () => {
    const created = expectOk(await api().post(v().base).set("Authorization", s.guard2.auth).send(v().body()), 201);
    expect(created).toMatchObject({ guardId: s.guard2.id, status: "PENDING" });
    expect(created.media).toHaveLength(2);

    const list = expectOk(await api().get(v().base).set("Authorization", s.shift.auth));
    expect(list.map((r: any) => r.id)).toContain(created.id);
    expect(JSON.stringify(list)).not.toMatch(/password/);

    const table = expectOk(await api().post(`${v().base}/datatable`).set("Authorization", s.admin.auth).send({ page: 1, limit: 10, filters: { status: "PENDING" } }));
    expect(table.total).toBe(v().countBefore + 1);
    expect(table.rows.map((r: any) => r.id)).toContain(created.id);
    expect(JSON.stringify(table)).not.toMatch(/password/);

    const before = expectOk(await api().get(`${v().base}/pending-count`).set("Authorization", s.guard1.auth)).count;
    expect(before).toBe(v().countBefore + 1);

    const manager = v().managers[1];
    const resolved = expectOk(await api().put(`${v().base}/${created.id}/resolve`).set("Authorization", s[manager].auth));
    expect(resolved).toMatchObject({ status: "ATTENDED", resolvedBy: { id: s[manager].id } });
    expect(resolved.resolvedAt).toBeTruthy();
    expect(expectOk(await api().get(`${v().base}/pending-count`).set("Authorization", s.guard1.auth)).count).toBe(before - 1);

    expectOk(await api().delete(`${v().base}/${created.id}/media?key=a/uno.jpg`).set("Authorization", s[manager].auth));
    expect(((await prisma.$queryRawUnsafe<any[]>(`SELECT media FROM "${name === "mantenimiento" ? "Maintenance" : "Incident"}" WHERE id = ${created.id}`))[0].media as any[]).map((m) => m.key)).toEqual(["a/dos.mp4"]);

    expectOk(await api().delete(`${v().base}/${created.id}`).set("Authorization", s.admin.auth));
    expectFail(await api().delete(`${v().base}/${created.id}`).set("Authorization", s.admin.auth), 404);
  });

  it("el autor siempre es quien tiene la sesión: guardId en el cuerpo se ignora", async () => {
    const created = expectOk(await api().post(v().base).set("Authorization", s.guard1.auth).send({ ...v().body(), guardId: s.guard2.id }), 201);
    expect(created.guardId).toBe(s.guard1.id);
  });

  it.each([
    ["sin título", { title: undefined }],
    ["título vacío", { title: "   " }],
    ["título enorme", { title: "x".repeat(201) }],
    ["descripción enorme", { description: "x".repeat(2001) }],
    ["título con tipo incorrecto", { title: 12345 }],
    ["media no es arreglo", { media: "foto.jpg" }],
    ["latitud fuera de rango", { latitude: 120 }],
    ["longitud no numérica", { longitude: "oeste" }],
  ])("valida la entrada: %s → 400", async (_n, over) => {
    const before = await prisma.incident.count() + (await prisma.maintenance.count());
    expectFail(await api().post(v().base).set("Authorization", s.guard1.auth).send({ ...v().body(), ...over }), 400, "VALIDATION_ERROR");
    expect((await prisma.incident.count()) + (await prisma.maintenance.count())).toBe(before);
  });

  it("categoría o tipo inexistente → 4xx sin filtrar detalles de la base", async () => {
    const res = await api().post(v().base).set("Authorization", s.guard1.auth).send({ ...v().body(), categoryId: MISSING_ID });
    expectFail(res, 400);
    expectFail(await api().post(v().base).set("Authorization", s.guard1.auth).send({ ...v().body(), typeId: MISSING_ID }), 400);
  });

  it("atender dos veces → 409; atender un id inexistente → 404; id no numérico → 400", async () => {
    const manager = s[v().managers[0]].auth;
    expectOk(await api().put(`${v().base}/${v().pendingId()}/resolve`).set("Authorization", manager));
    expectFail(await api().put(`${v().base}/${v().pendingId()}/resolve`).set("Authorization", manager), 409, "INVALID_TRANSITION");
    expectFail(await api().put(`${v().base}/${MISSING_ID}/resolve`).set("Authorization", manager), 404);
    const bad = await api().put(`${v().base}/abc/resolve`).set("Authorization", manager);
    expect(bad.status).toBeGreaterThanOrEqual(400);
    expect(bad.status).toBeLessThan(500);
  });

  it("quitar evidencia: falta el key → 400; registro inexistente → 404", async () => {
    const manager = s[v().managers[0]].auth;
    expectFail(await api().delete(`${v().base}/${v().pendingId()}/media`).set("Authorization", manager), 400);
    expectFail(await api().delete(`${v().base}/${MISSING_ID}/media?key=x`).set("Authorization", manager), 404);
  });

  it("solo el rol responsable atiende y borra; los demás → 403; sin token → 401", async () => {
    for (const key of v().others) {
      expectFail(await api().put(`${v().base}/${v().pendingId()}/resolve`).set("Authorization", s[key].auth), 403);
      expectFail(await api().delete(`${v().base}/${v().pendingId()}`).set("Authorization", s[key].auth), 403);
      expectFail(await api().delete(`${v().base}/${v().pendingId()}/media?key=x`).set("Authorization", s[key].auth), 403);
    }
    expectFail(await api().post(v().base).send(v().body()), 401);
    expectFail(await api().get(v().base), 401);
    expect((await prisma.incident.count()) + (await prisma.maintenance.count())).toBeGreaterThan(0);
  });

  it("los residentes no ven ni crean reportes operativos → 403", async () => {
    expectFail(await api().get(v().base).set("Authorization", s.resident.auth), 403);
    expectFail(await api().post(v().base).set("Authorization", s.resident.auth).send(v().body()), 403);
    expectFail(await api().post(`${v().base}/datatable`).set("Authorization", s.resident.auth).send({}), 403);
    expectFail(await api().get(`${v().base}/pending-count`).set("Authorization", s.resident.auth), 403);
  });

  it("filtros de listado y datatable inválidos no producen 500", async () => {
    for (const q of ["startDate=hoy", "endDate=ayer&startDate=hoy", "guardId=abc", "title=%00"]) {
      expect((await api().get(`${v().base}?${q}`).set("Authorization", s.admin.auth)).status).toBeLessThan(500);
    }
    for (const body of [{}, { page: 1, limit: 10, filters: { status: "NOEXISTE" } }, { page: 1, limit: 10, filters: { campoRaro: "x" } }, { page: 1, limit: 10, sort: { key: "noExiste", direction: "asc" } }]) {
      expect((await api().post(`${v().base}/datatable`).set("Authorization", s.admin.auth).send(body)).status).toBeLessThan(500);
    }
  });
});

describe("incidencias · particularidades", () => {
  const I = `${V1}/incidents`;

  it("el listado y el conteo solo incluyen incidencias, no reportes de casa club", async () => {
    const list = expectOk(await api().get(I).set("Authorization", s.admin.auth));
    expect(list.map((r: any) => r.id).sort()).toEqual([flows.reports.pendingIncidentId, flows.reports.attendedIncidentId].sort());
    expect(expectOk(await api().get(`${I}/pending-count`).set("Authorization", s.admin.auth)).count).toBe(1);
    expectFail(await api().delete(`${I}/${flows.reports.clubReportId}`).set("Authorization", s.admin.auth), 404);
  });

  it("filtra por categoría, por guardia y por texto del título", async () => {
    const byCategory = expectOk(await api().get(`${I}?category=SEGURIDAD`).set("Authorization", s.admin.auth));
    expect(byCategory.map((r: any) => r.id)).toEqual(expect.arrayContaining([flows.reports.pendingIncidentId]));
    expect(expectOk(await api().get(`${I}?category=NO_EXISTE`).set("Authorization", s.admin.auth))).toEqual([]);
    expect(expectOk(await api().get(`${I}?guardId=${s.guard2.id}`).set("Authorization", s.admin.auth))).toEqual([]);
    expect(expectOk(await api().get(`${I}?title=PUERTA`).set("Authorization", s.admin.auth)).map((r: any) => r.id)).toEqual([flows.reports.pendingIncidentId]);
    const future = expectOk(await api().get(`${I}?startDate=2999-01-01`).set("Authorization", s.admin.auth));
    expect(future).toEqual([]);
  });

  it("datatable: búsqueda por título/categoría y filtro por estado", async () => {
    const search = expectOk(await api().post(`${I}/datatable`).set("Authorization", s.admin.auth).send({ page: 1, limit: 10, filters: { search: "seguridad" } }));
    expect(search.total).toBe(2);
    const byTitle = expectOk(await api().post(`${I}/datatable`).set("Authorization", s.admin.auth).send({ page: 1, limit: 10, filters: { search: "PUERTA abierta" } }));
    expect(byTitle.rows.map((r: any) => r.id)).toEqual([flows.reports.pendingIncidentId]);
    const attended = expectOk(await api().post(`${I}/datatable`).set("Authorization", s.admin.auth).send({ page: 1, limit: 10, filters: { status: "ATTENDED" } }));
    expect(attended.rows.map((r: any) => r.id)).toEqual([flows.reports.attendedIncidentId]);
    const all = expectOk(await api().post(`${I}/datatable`).set("Authorization", s.admin.auth).send({ page: 1, limit: 10, filters: { status: "ALL" } }));
    expect(all.total).toBe(2);
  });

  it("la evidencia debe ser imagen o video con URL válida", async () => {
    expectFail(await api().post(I).set("Authorization", s.guard1.auth).send({ title: "X", media: [{ type: "AUDIO", url: "https://example.test/a.mp3" }] }), 400, "VALIDATION_ERROR");
    expectFail(await api().post(I).set("Authorization", s.guard1.auth).send({ title: "X", media: [{ type: "IMAGE", url: "no-es-url" }] }), 400, "VALIDATION_ERROR");
  });

  it("crear con categoría y tipo válidos los vincula", async () => {
    const cat = await prisma.incidentCategory.findUniqueOrThrow({ where: { name: "SEGURIDAD" } });
    const type = await prisma.incidentType.findUniqueOrThrow({ where: { name: "INTRUSION" } });
    const created = expectOk(await api().post(I).set("Authorization", s.guard1.auth).send({ title: "Intrusión", categoryId: String(cat.id), typeId: type.id }), 201);
    expect(created).toMatchObject({ categoryId: cat.id, typeId: type.id, kind: "INCIDENT" });
  });
});

describe("casa club · particularidades", () => {
  const C = `${V1}/club`;

  it("el mismo clientRef no duplica el reporte (reintentos de la APP)", async () => {
    const body = { title: "Desde la APP sin red", clientRef: "app-123", createdAt: "2026-01-02T10:00:00.000Z" };
    const first = expectOk(await api().post(C).set("Authorization", s.guard1.auth).send(body), 201);
    const again = expectOk(await api().post(C).set("Authorization", s.guard1.auth).send(body), 201);
    expect(again.id).toBe(first.id);
    expect(new Date(first.createdAt).toISOString()).toBe("2026-01-02T10:00:00.000Z");
    expect(await prisma.incident.count({ where: { clientRef: "app-123" } })).toBe(1);
  });

  it("solo lista reportes de casa club; no toca incidencias", async () => {
    expect(expectOk(await api().get(C).set("Authorization", s.admin.auth)).map((r: any) => r.id)).toEqual([flows.reports.clubReportId]);
    expectFail(await api().delete(`${C}/${flows.reports.pendingIncidentId}`).set("Authorization", s.admin.auth), 404);
    expectFail(await api().put(`${C}/${flows.reports.pendingIncidentId}/resolve`).set("Authorization", s.admin.auth), 404);
    expect((await prisma.incident.findUniqueOrThrow({ where: { id: flows.reports.pendingIncidentId } })).status).toBe("PENDING");
    expect(expectOk(await api().get(`${C}/pending-count`).set("Authorization", s.admin.auth)).count).toBe(1);
  });

  it("fecha de captura inválida → 400", async () => {
    expectFail(await api().post(C).set("Authorization", s.guard1.auth).send({ title: "X", createdAt: "ayer por la tarde" }), 400, "VALIDATION_ERROR");
  });
});

describe("mantenimiento · particularidades", () => {
  const M = `${V1}/maintenance`;

  it("filtra por categoría de texto y por guardia", async () => {
    expect(expectOk(await api().get(`${M}?category=${encodeURIComponent("Eléctrico")}`).set("Authorization", s.admin.auth)).map((r: any) => r.id)).toEqual([flows.reports.pendingMaintenanceId]);
    expect(expectOk(await api().get(`${M}?category=Otro`).set("Authorization", s.admin.auth))).toEqual([]);
    expect(expectOk(await api().get(`${M}?guardId=${s.guard2.id}`).set("Authorization", s.admin.auth))).toEqual([]);
  });

  it("MAINT crea y atiende sus reportes; SHIFT no atiende mantenimiento", async () => {
    const created = expectOk(await api().post(M).set("Authorization", s.maint.auth).send({ title: "Cambiar foco" }), 201);
    expectFail(await api().put(`${M}/${created.id}/resolve`).set("Authorization", s.shift.auth), 403);
    expectOk(await api().put(`${M}/${created.id}/resolve`).set("Authorization", s.maint.auth));
  });
});
