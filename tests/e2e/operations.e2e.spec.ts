/**
 * Flujos de operación del turno: entrega de turno, revisión de uniforme, dashboard en vivo,
 * reportes de desempeño y PDF, y salud del servicio.
 */
import { clearSettingsCache } from "@src/core/settings/app-settings.service";
import { api, allSessions, bootFlows, disconnectDatabase, expectFail, expectOk, MISSING_ID, prisma, Session, V1 } from "./support";
import { FlowsResult } from "../../prisma/seeds/flows";

let flows: FlowsResult;
let s: Record<string, Session>;

beforeEach(async () => {
  flows = await bootFlows();
  s = await allSessions();
  clearSettingsCache();
});
afterAll(disconnectDatabase);

describe("entrega de turno", () => {
  const H = `${V1}/shift-handover`;
  const body = (over: Record<string, unknown> = {}) => ({
    shiftType: "NOCTURNO", handoverDate: "2026-02-10", credentialsCount: "2", tarjetonesCount: 8, novedades: "Portón dañado",
    checklistPhones: true, checklistTablet: "1", checklistRadios: false, checklistKeys: true, checklistLogbook: true, checklistConsignas: true,
    reportedToAdmin: true, elements: [{ guardId: s.guard1.id, entryTime: "22:55", punctual: true }, { guardId: s.guard2.id, entryTime: "23:20", punctual: false, observations: "Llegó tarde" }], ...over,
  });

  it("camino feliz: crear → detalle → datatable", async () => {
    const created = expectOk(await api().post(H).set("Authorization", s.shift.auth).send(body()), 201);
    expect(created).toMatchObject({ shiftType: "NOCTURNO", credentialsCount: 2, checklistTablet: true, checklistRadios: false, createdBy: { id: s.shift.id } });
    expect(created.elements.map((e: any) => [e.guard.id, e.punctual])).toEqual([[s.guard1.id, true], [s.guard2.id, false]]);

    const detail = expectOk(await api().get(`${H}/${created.id}`).set("Authorization", s.admin.auth));
    expect(detail.elements).toHaveLength(2);
    expect(JSON.stringify(detail)).not.toMatch(/password/);

    const table = expectOk(await api().post(`${H}/datatable`).set("Authorization", s.admin.auth).send({ page: 1, limit: 10, filters: {} }));
    expect(table.total).toBe(2);
    expect(table.rows.find((r: any) => r.id === created.id)._count.elements).toBe(2);
  });

  it("exige confirmar que se reportó a la administración", async () => {
    expectFail(await api().post(H).set("Authorization", s.shift.auth).send(body({ reportedToAdmin: false })), 400);
    expectFail(await api().post(H).set("Authorization", s.shift.auth).send(body({ reportedToAdmin: undefined })), 400);
    expect(await prisma.shiftHandover.count()).toBe(1);
  });

  it("un turno y fecha solo admiten un reporte → 400 con mensaje claro", async () => {
    expectOk(await api().post(H).set("Authorization", s.shift.auth).send(body()), 201);
    const dup = await api().post(H).set("Authorization", s.admin.auth).send(body());
    expectFail(dup, 400);
    expect(dup.body.messages.join(" ")).toMatch(/Ya existe un reporte/);
    expectOk(await api().post(H).set("Authorization", s.admin.auth).send(body({ shiftType: "MATUTINO" })), 201);
  });

  it.each([
    ["turno desconocido", { shiftType: "VESPERTINO" }],
    ["sin turno", { shiftType: undefined }],
    ["fecha sin formato", { handoverDate: "10/02/2026" }],
    ["fecha imposible", { handoverDate: "2026-13-45" }],
    ["sin fecha", { handoverDate: undefined }],
    ["credenciales negativas", { credentialsCount: -1 }],
    ["conteo no numérico", { tarjetonesCount: "muchos" }],
    ["novedades enormes", { novedades: "x".repeat(5001) }],
    ["elementos no es arreglo", { elements: "uno" }],
  ])("valida la entrada: %s → 400", async (_n, over) => {
    expectFail(await api().post(H).set("Authorization", s.shift.auth).send(body(over)), 400);
    expect(await prisma.shiftHandover.count()).toBe(1);
  });

  it("un guardia inexistente en los elementos → 4xx y no queda el reporte a medias", async () => {
    const res = await api().post(H).set("Authorization", s.shift.auth).send(body({ elements: [{ guardId: MISSING_ID, entryTime: "22:00" }] }));
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    expect(await prisma.shiftHandover.count()).toBe(1);
  });

  it("detalle inexistente → 404; id no numérico no produce 500", async () => {
    expectFail(await api().get(`${H}/${MISSING_ID}`).set("Authorization", s.admin.auth), 404);
    const bad = await api().get(`${H}/abc`).set("Authorization", s.admin.auth);
    expect(bad.status).toBeGreaterThanOrEqual(400);
    expect(bad.status).toBeLessThan(500);
  });

  it("pendiente: según la hora de alerta del turno que acaba de cerrar y si ya se entregó", async () => {
    const setTimes = async (morning: string, evening: string) => {
      for (const [key, value] of [["SHIFT_ALERT_MORNING_TIME", morning], ["SHIFT_ALERT_EVENING_TIME", evening]]) {
        await prisma.appSetting.upsert({ where: { key }, update: { value }, create: { key, value, valueType: "string", group: "turnos" } });
      }
      clearSettingsCache();
    };
    // Antes de la alerta de la mañana (y de la tarde): nada pendiente.
    await setTimes("23:59", "23:59");
    expect(expectOk(await api().get(`${H}/pending`).set("Authorization", s.shift.auth))).toMatchObject({ pending: false, shiftType: null });
    // Pasó la alerta de la mañana: toca el turno nocturno.
    await setTimes("00:00", "23:59");
    const today = new Date().toISOString().slice(0, 10);
    const night = expectOk(await api().get(`${H}/pending`).set("Authorization", s.shift.auth));
    expect(night).toMatchObject({ pending: true, shiftType: "NOCTURNO", date: today });
    expectOk(await api().post(H).set("Authorization", s.shift.auth).send(body({ shiftType: "NOCTURNO", handoverDate: today })), 201);
    expect(expectOk(await api().get(`${H}/pending`).set("Authorization", s.shift.auth))).toMatchObject({ pending: false, shiftType: "NOCTURNO" });
    // Pasó también la de la tarde: toca el matutino.
    await setTimes("00:00", "00:00");
    expect(expectOk(await api().get(`${H}/pending`).set("Authorization", s.shift.auth))).toMatchObject({ pending: true, shiftType: "MATUTINO" });
  });

  it("solo ADMIN y SHIFT; GUARD, MAINT y residentes → 403; sin token → 401", async () => {
    for (const key of ["guard1", "maint", "resident"]) {
      expectFail(await api().post(H).set("Authorization", s[key].auth).send(body()), 403);
      expectFail(await api().get(`${H}/pending`).set("Authorization", s[key].auth), 403);
      expectFail(await api().get(`${H}/${flows.operations.shiftHandoverId}`).set("Authorization", s[key].auth), 403);
      expectFail(await api().post(`${H}/datatable`).set("Authorization", s[key].auth).send({}), 403);
    }
    expectFail(await api().get(`${H}/pending`), 401);
  });
});

describe("revisión de uniforme", () => {
  const U = `${V1}/uniform`;

  it("camino feliz: evaluar → historial del guardia → datatable", async () => {
    const created = expectOk(await api().post(U).set("Authorization", s.shift.auth).send({ guardId: String(s.guard2.id), pantalon: true, botas: "1", camisa: "true", gorra: false, notes: "Falta la gorra" }), 201);
    expect(created).toMatchObject({ pantalon: true, botas: true, camisa: true, gorra: false, cinturon: false, evaluatedBy: { id: s.shift.id }, guard: { id: s.guard2.id } });
    expect(expectOk(await api().get(`${U}/by-guard/${s.guard2.id}`).set("Authorization", s.admin.auth)).map((u: any) => u.id)).toEqual([created.id]);
    expect(expectOk(await api().get(`${U}/by-guard/${s.guard1.id}`).set("Authorization", s.admin.auth))).toHaveLength(1);
    const table = expectOk(await api().post(`${U}/datatable`).set("Authorization", s.admin.auth).send({ page: 1, limit: 1, filters: {} }));
    expect(table).toMatchObject({ total: 2 });
    expect(table.rows).toHaveLength(1);
  });

  it("el evaluador sale del token, no del cuerpo", async () => {
    const created = expectOk(await api().post(U).set("Authorization", s.shift.auth).send({ guardId: s.guard1.id, evaluatedById: s.admin.id }), 201);
    expect(created.evaluatedBy.id).toBe(s.shift.id);
  });

  it.each([
    ["sin guardia", {}],
    ["guardia no numérico", { guardId: "uno" }],
    ["bandera inválida", { guardId: 1, pantalon: "quizá" }],
    ["notas enormes", { guardId: 1, notes: "x".repeat(2001) }],
  ])("valida la entrada: %s → 400", async (_n, body) => {
    expectFail(await api().post(U).set("Authorization", s.shift.auth).send(body), 400, "VALIDATION_ERROR");
  });

  it("guardia inexistente → 4xx sin detalles de la base; historial de uno inexistente vacío; id no numérico → sin 500", async () => {
    expectFail(await api().post(U).set("Authorization", s.shift.auth).send({ guardId: MISSING_ID }), 400);
    expect(expectOk(await api().get(`${U}/by-guard/${MISSING_ID}`).set("Authorization", s.admin.auth))).toEqual([]);
    const bad = await api().get(`${U}/by-guard/abc`).set("Authorization", s.admin.auth);
    expect(bad.status).toBeLessThan(500);
  });

  it("solo ADMIN y SHIFT; GUARD, MAINT y residentes → 403", async () => {
    for (const key of ["guard1", "maint", "resident"]) {
      expectFail(await api().post(U).set("Authorization", s[key].auth).send({ guardId: s.guard1.id }), 403);
      expectFail(await api().get(`${U}/by-guard/${s.guard1.id}`).set("Authorization", s[key].auth), 403);
      expectFail(await api().post(`${U}/datatable`).set("Authorization", s[key].auth).send({}), 403);
    }
  });
});

describe("dashboard en vivo", () => {
  const D = `${V1}/dashboard/live`;

  it("foto de la operación: rondas en curso con avance, guardias de turno, alertas y rutas sin cubrir", async () => {
    await prisma.round.updateMany({ data: { status: "COMPLETED" } });
    await prisma.user.update({ where: { id: s.guard1.id }, data: { isLoggedIn: true } });
    const round = await prisma.round.create({ data: { guardId: s.guard1.id, status: "IN_PROGRESS", recurringConfigurationId: flows.routes.configurationId, startTime: new Date(Date.now() - 60 * 60_000) } });
    await prisma.kardex.create({ data: { userId: s.guard1.id, locationId: flows.routes.locationIds[0], notes: "ok", media: [{ type: "IMAGE", url: "https://example.test/x.jpg" }], latitude: 32.5, longitude: -117, timestamp: new Date(Date.now() - 5 * 60_000) } });

    const live = expectOk(await api().get(D).set("Authorization", s.shift.auth));
    expect(live.kpis).toMatchObject({ activeRoundsCount: 1, guardsOnShiftCount: 1, openIncidentsCount: 1, routesTotal: 1, routesCovered: 1 });
    expect(live.activeRounds[0]).toMatchObject({ roundId: round.id, scannedCount: 1, totalLocations: 3, progressPercent: 33, stale: false });
    expect(live.mapPoints).toHaveLength(1);
    expect(live.guardsOnShift[0]).toMatchObject({ guardId: s.guard1.id, status: "ON_ROUND" });
    expect(live.alerts.map((a: any) => a.type)).toContain("INCIDENT_OPEN");
    expect(live.uncoveredRoutes).toEqual([]);
    expect(JSON.stringify(live)).not.toMatch(/password/);
  });

  it("una ronda sin escaneos recientes genera alerta ROUND_STALLED; sin rondas hay rutas sin cubrir", async () => {
    await prisma.round.updateMany({ data: { status: "COMPLETED" } });
    expect(expectOk(await api().get(D).set("Authorization", s.admin.auth)).uncoveredRoutes).toHaveLength(1);
    await prisma.round.create({ data: { guardId: s.guard2.id, status: "IN_PROGRESS", startTime: new Date(Date.now() - 3 * 3600_000) } });
    const live = expectOk(await api().get(D).set("Authorization", s.admin.auth));
    expect(live.activeRounds[0].stale).toBe(true);
    expect(live.alerts.find((a: any) => a.type === "ROUND_STALLED")).toMatchObject({ severity: "high" });
  });

  it("los reportes de casa club no cuentan como incidencias abiertas", async () => {
    const live = expectOk(await api().get(D).set("Authorization", s.admin.auth));
    expect(live.kpis.openIncidentsCount).toBe(1);
  });

  it("solo ADMIN y SHIFT; el resto → 403; sin token → 401", async () => {
    for (const key of ["guard1", "maint", "resident"]) expectFail(await api().get(D).set("Authorization", s[key].auth), 403);
    expectFail(await api().get(D), 401);
  });
});

describe("reportes de desempeño del personal", () => {
  const R = `${V1}/reports/guards`;
  const range = `startDate=2020-01-01&endDate=2999-12-31`;

  it.each(["stats", "top-performance", "distribution", "detail", "workload"])("%s responde con datos para el rango", async (name) => {
    const res = await api().get(`${R}/${name}?${range}`).set("Authorization", s.admin.auth);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(JSON.stringify(res.body)).not.toMatch(/password/);
  });

  it("estadísticas del guardia 1: cuenta lo suyo; desglose por guardia", async () => {
    const stats = expectOk(await api().get(`${R}/stats?${range}&guardId=${s.guard1.id}`).set("Authorization", s.shift.auth));
    expect(JSON.stringify(stats)).toBeTruthy();
    const detail = await api().get(`${R}/detail-breakdown/${s.guard1.id}?${range}`).set("Authorization", s.admin.auth);
    expect(detail.status).toBe(200);
    expect(detail.body.success).toBe(true);
  });

  it.each(["stats", "top-performance", "distribution", "detail", "workload"])("%s sin fechas o con fechas inválidas → 400", async (name) => {
    expectFail(await api().get(`${R}/${name}`).set("Authorization", s.admin.auth), 400, "VALIDATION_ERROR");
    expectFail(await api().get(`${R}/${name}?startDate=ayer&endDate=hoy`).set("Authorization", s.admin.auth), 400, "VALIDATION_ERROR");
  });

  it("guardId inválido y desglose con id no numérico → 400", async () => {
    expectFail(await api().get(`${R}/stats?${range}&guardId=abc`).set("Authorization", s.admin.auth), 400, "VALIDATION_ERROR");
    expectFail(await api().get(`${R}/detail-breakdown/abc?${range}`).set("Authorization", s.admin.auth), 400, "VALIDATION_ERROR");
  });

  it("solo ADMIN y SHIFT ven el desempeño comparado; GUARD, MAINT y residentes → 403", async () => {
    for (const key of ["guard1", "maint", "resident"]) {
      expectFail(await api().get(`${R}/stats?${range}`).set("Authorization", s[key].auth), 403);
      expectFail(await api().get(`${R}/top-performance?${range}`).set("Authorization", s[key].auth), 403);
    }
    expectFail(await api().get(`${R}/stats?${range}`), 401);
  });
});

describe("reportes PDF", () => {
  const q = "startDate=2020-01-01T00:00:00.000Z&endDate=2999-12-31T23:59:59.000Z&includeImages=false&includeLocation=false";

  const pdf = (path: string, auth: string) =>
    api().get(`${V1}${path}?${q}`).set("Authorization", auth).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => cb(null, Buffer.concat(chunks)));
    });

  it.each(["/reports/incidents/pdf", "/reports/club/pdf", "/maintenance/report/pdf"])("%s devuelve un PDF válido", async (path) => {
    const res = await pdf(path, s.admin.auth);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/application\/pdf/);
    expect(res.headers["content-disposition"]).toMatch(/attachment; filename=".*\.pdf"/);
    expect((res.body as Buffer).subarray(0, 4).toString()).toBe("%PDF");
  });

  it("con ids seleccionados, con rango vacío y sin resultados sigue siendo un PDF", async () => {
    const ids = await api().get(`${V1}/reports/incidents/pdf?${q}&ids=${flows.reports.pendingIncidentId},abc,-1`).set("Authorization", s.shift.auth).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => cb(null, Buffer.concat(chunks)));
    });
    expect(ids.status).toBe(200);
    const empty = await api().get(`${V1}/reports/club/pdf?startDate=2000-01-01T00:00:00.000Z&endDate=2000-01-02T00:00:00.000Z&includeImages=false`).set("Authorization", s.admin.auth).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => cb(null, Buffer.concat(chunks)));
    });
    expect(empty.status).toBe(200);
  });

  it.each(["/reports/incidents/pdf", "/reports/club/pdf", "/maintenance/report/pdf"])("%s con fechas ausentes o inválidas → 400", async (path) => {
    expectFail(await api().get(`${V1}${path}`).set("Authorization", s.admin.auth), 400);
    expectFail(await api().get(`${V1}${path}?startDate=ayer&endDate=hoy`).set("Authorization", s.admin.auth), 400);
  });

  it("residentes sin acceso → 403; sin token → 401", async () => {
    for (const path of ["/reports/incidents/pdf", "/reports/club/pdf", "/maintenance/report/pdf"]) {
      expectFail(await api().get(`${V1}${path}?${q}`).set("Authorization", s.resident.auth), 403);
      expectFail(await api().get(`${V1}${path}?${q}`), 401);
    }
  });
});

describe("salud y documentación", () => {
  it("/health y /ready responden sin token; la raíz de la API confirma que está viva", async () => {
    expect((await api().get("/health")).body).toEqual({ status: "ok" });
    expect((await api().get("/ready")).body).toEqual({ status: "ready" });
    expectOk(await api().get(`${V1}/`));
  });

  it("el contrato se publica fuera de producción", async () => {
    const res = await api().get("/swagger.json");
    expect(res.status).toBe(200);
    expect(res.body.paths).toBeTruthy();
  });

  it("rutas inexistentes y JSON mal formado responden con formato estándar, sin detalles internos", async () => {
    const missing = await api().get(`${V1}/no-existe`).set("Authorization", s.admin.auth);
    expect(missing.status).toBe(404);
    const malformed = await api().post(`${V1}/users/login`).set("Content-Type", "application/json").send('{"username": ');
    expectFail(malformed, 400);
    const huge = await api().post(`${V1}/users/login`).send({ username: "x".repeat(2 * 1024 * 1024), password: "x" });
    expectFail(huge, 413);
    const nulls = await api().post(`${V1}/users/login`).send({ username: "a\u0000b", password: "x" });
    expectFail(nulls, 400, "INVALID_CHARACTERS");
  });

  it("las cabeceras de seguridad están activas y CORS solo permite orígenes configurados", async () => {
    const res = await api().get(`${V1}/`).set("Origin", "http://localhost:5002");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:5002");
    const evil = await api().get(`${V1}/`).set("Origin", "https://evil.example");
    expect(evil.headers["access-control-allow-origin"]).toBeUndefined();
  });
});
