/**
 * Flujo de patrullaje: rutas recurrentes, rondas, bitácora (kardex) y asignaciones puntuales.
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

const photo = (n = 1) => [{ type: "IMAGE", url: `https://example.test/p${n}.jpg`, key: `p${n}.jpg` }];

describe("rutas recurrentes", () => {
  const R = `${V1}/recurring`;
  const route = (locationIds: number[], over: Record<string, unknown> = {}) => ({
    title: "Ronda nocturna",
    locations: locationIds.map((locationId) => ({ locationId, tasks: [{ description: "Revisar portón", reqPhoto: true }] })),
    ...over,
  });

  it("camino feliz: crear → listar → datatable → editar → asignar → pausar → borrar", async () => {
    const [a, b] = flows.routes.locationIds;
    const created = expectOk(await api().post(R).set("Authorization", s.shift.auth).send(route([a, b], { guardIds: [s.guard1.id] })), 201);
    expect(created).toMatchObject({ title: "Ronda nocturna", active: true });
    expect(created.recurringLocations).toHaveLength(2);
    expect(created.guards.map((g: any) => g.id)).toEqual([s.guard1.id]);
    expect(JSON.stringify(created)).not.toMatch(/password/);

    expect(expectOk(await api().get(R).set("Authorization", s.admin.auth))).toHaveLength(2);
    const table = expectOk(await api().post(`${R}/datatable`).set("Authorization", s.admin.auth).send({ page: 1, limit: 1, filters: {} }));
    expect(table).toMatchObject({ total: 2 });
    expect(table.rows).toHaveLength(1);

    const updated = expectOk(await api().put(`${R}/${created.id}`).set("Authorization", s.admin.auth).send(route([b], { title: "Ronda editada", guardIds: [] })));
    expect(updated.title).toBe("Ronda editada");
    expect(updated.recurringLocations).toHaveLength(1);
    expect(updated.guards).toEqual([]);

    const assigned = expectOk(await api().post(`${R}/${created.id}/assign`).set("Authorization", s.admin.auth).send({ guardIds: [s.guard1.id, s.guard2.id] }));
    expect(assigned.guards).toHaveLength(2);

    expect(expectOk(await api().put(`${R}/${created.id}/toggle`).set("Authorization", s.admin.auth).send({ active: "false" })).active).toBe(false);
    expect(expectOk(await api().get(`${R}/my-list`).set("Authorization", s.guard1.auth)).map((c: any) => c.id)).not.toContain(created.id);

    expectOk(await api().delete(`${R}/${created.id}`).set("Authorization", s.admin.auth));
    expect(await prisma.recurringConfiguration.findUnique({ where: { id: created.id } })).toBeNull();
    expect(await prisma.recurringLocation.count({ where: { configurationId: created.id } })).toBe(0);
  });

  it("sin guardIds se asigna a todo el personal operativo activo; con [] a nadie", async () => {
    const [a] = flows.routes.locationIds;
    const all = expectOk(await api().post(R).set("Authorization", s.admin.auth).send(route([a])), 201);
    expect(all.guards.map((g: any) => g.id).sort()).toEqual([s.shift.id, s.guard1.id, s.guard2.id, s.maint.id].sort());
    const none = expectOk(await api().post(R).set("Authorization", s.admin.auth).send(route([a], { title: "Sin guardias", guardIds: [] })), 201);
    expect(none.guards).toEqual([]);
  });

  it("my-list: el guardia ve solo SUS rutas activas y qué puntos ya escaneó en la ronda en curso", async () => {
    const mine = expectOk(await api().get(`${R}/my-list`).set("Authorization", s.guard1.auth));
    expect(mine.map((c: any) => c.id)).toEqual([flows.routes.configurationId]);
    // Sin ronda en curso cuentan los escaneos de hoy: los dos puntos de la ronda sembrada.
    const [first, second, third] = flows.routes.locationIds;
    expect(mine[0].recurringLocations.filter((l: any) => l.completed).map((l: any) => l.locationId).sort()).toEqual([first, second].sort());
    expect(mine[0].recurringLocations.find((l: any) => l.locationId === third).completed).toBe(false);

    await prisma.round.deleteMany();
    const start = expectOk(await api().post(`${V1}/rounds/start`).set("Authorization", s.guard1.auth).send({}));
    expect(expectOk(await api().get(`${R}/my-list`).set("Authorization", s.guard1.auth))[0].recurringLocations.some((l: any) => l.completed)).toBe(false);
    expectOk(await api().post(`${V1}/kardex`).set("Authorization", s.guard1.auth).send({ userId: s.guard1.id, locationId: first, notes: "Todo en orden", media: photo() }), 201);
    const after = expectOk(await api().get(`${R}/my-list`).set("Authorization", s.guard1.auth));
    const done = after[0].recurringLocations.filter((l: any) => l.completed).map((l: any) => l.locationId);
    expect(done).toEqual([first]);
    expect(start.recurringConfigurationId).toBe(flows.routes.configurationId);

    expect(expectOk(await api().get(`${R}/my-list`).set("Authorization", s.guard2.auth)).map((c: any) => c.id)).toEqual([flows.routes.configurationId]);
    expect(expectOk(await api().get(`${R}/my-list`).set("Authorization", s.maint.auth))).toEqual([]);
  });

  it.each([
    ["sin título", { title: undefined }],
    ["título vacío", { title: "  " }],
    ["título largo", { title: "x".repeat(151) }],
    ["sin puntos", { locations: [] }],
    ["locations no es arreglo", { locations: "A" }],
    ["punto sin locationId", { locations: [{ tasks: [] }] }],
    ["tarea sin descripción", { locations: [{ locationId: 1, tasks: [{ description: "" }] }] }],
    ["guardIds con ids inválidos", { guardIds: ["x"] }],
  ])("valida la entrada al crear: %s → 400", async (_n, over) => {
    const before = await prisma.recurringConfiguration.count();
    expectFail(await api().post(R).set("Authorization", s.admin.auth).send(route([flows.routes.locationIds[0]], over)), 400, "VALIDATION_ERROR");
    expect(await prisma.recurringConfiguration.count()).toBe(before);
  });

  it("referencias inexistentes (ubicación o guardia) → 4xx y sin dejar la ruta a medias", async () => {
    const before = await prisma.recurringConfiguration.count();
    const badLocation = await api().post(R).set("Authorization", s.admin.auth).send(route([MISSING_ID]));
    expectFail(badLocation, 400);
    const badGuard = await api().post(R).set("Authorization", s.admin.auth).send(route([flows.routes.locationIds[0]], { guardIds: [MISSING_ID] }));
    expect(badGuard.status).toBeGreaterThanOrEqual(400);
    expect(badGuard.status).toBeLessThan(500);
    expect(await prisma.recurringConfiguration.count()).toBe(before);
  });

  it("una ruta solo se asigna a personal operativo (no a residentes ni a inexistentes)", async () => {
    const id = flows.routes.configurationId;
    expectFail(await api().post(`${R}/${id}/assign`).set("Authorization", s.admin.auth).send({ guardIds: [s.resident.id] }), 400);
    const missing = await api().post(`${R}/${id}/assign`).set("Authorization", s.admin.auth).send({ guardIds: [MISSING_ID] });
    expect(missing.status).toBeGreaterThanOrEqual(400);
    expect(missing.status).toBeLessThan(500);
    expectFail(await api().post(`${R}/${id}/assign`).set("Authorization", s.admin.auth).send({}), 400, "VALIDATION_ERROR");
    expect((await prisma.recurringConfiguration.findUniqueOrThrow({ where: { id }, include: { guards: true } })).guards).toHaveLength(2);
  });

  it("editar, pausar, asignar o borrar una ruta inexistente → 404; id no numérico → 400", async () => {
    const body = route([flows.routes.locationIds[0]]);
    expectFail(await api().put(`${R}/${MISSING_ID}`).set("Authorization", s.admin.auth).send(body), 404);
    expectFail(await api().put(`${R}/${MISSING_ID}/toggle`).set("Authorization", s.admin.auth).send({ active: true }), 404);
    expectFail(await api().post(`${R}/${MISSING_ID}/assign`).set("Authorization", s.admin.auth).send({ guardIds: [] }), 404);
    expectFail(await api().delete(`${R}/${MISSING_ID}`).set("Authorization", s.admin.auth), 404);
    expectFail(await api().put(`${R}/abc`).set("Authorization", s.admin.auth).send(body), 400, "VALIDATION_ERROR");
    expectFail(await api().put(`${R}/${flows.routes.configurationId}/toggle`).set("Authorization", s.admin.auth).send({ active: "quizá" }), 400, "VALIDATION_ERROR");
  });

  it("una ruta con rondas registradas no se borra (se conserva el historial) → 409", async () => {
    expectFail(await api().delete(`${R}/${flows.routes.configurationId}`).set("Authorization", s.admin.auth), 409);
    expect(await prisma.recurringConfiguration.findUnique({ where: { id: flows.routes.configurationId } })).not.toBeNull();
    expect(await prisma.recurringLocation.count({ where: { configurationId: flows.routes.configurationId } })).toBe(3);
  });

  it("gestión solo ADMIN y SHIFT; my-list para personal operativo; residentes sin acceso", async () => {
    for (const key of ["guard1", "maint", "resident"]) {
      expectFail(await api().get(R).set("Authorization", s[key].auth), 403);
      expectFail(await api().post(R).set("Authorization", s[key].auth).send(route([flows.routes.locationIds[0]])), 403);
      expectFail(await api().post(`${R}/datatable`).set("Authorization", s[key].auth).send({}), 403);
    }
    expectFail(await api().get(`${R}/my-list`).set("Authorization", s.resident.auth), 403);
    expectFail(await api().get(R), 401);
  });
});

describe("rondas", () => {
  const RD = `${V1}/rounds`;

  beforeEach(async () => {
    // El seed trae una ronda terminada; para probar el inicio se parte sin rondas activas.
    await prisma.round.updateMany({ data: { status: "COMPLETED" } });
  });

  it("camino feliz: iniciar → ronda actual → escanear → detalle con línea de tiempo → terminar → listados", async () => {
    const started = expectOk(await api().post(`${RD}/start`).set("Authorization", s.guard1.auth).send({ recurringConfigId: flows.routes.configurationId }));
    expect(started).toMatchObject({ guardId: s.guard1.id, status: "IN_PROGRESS", recurringConfigurationId: flows.routes.configurationId });
    expect(JSON.stringify(started)).not.toMatch(/password/);

    const current = expectOk(await api().get(`${RD}/current`).set("Authorization", s.guard1.auth));
    expect(current.id).toBe(started.id);

    const [p1, p2] = flows.routes.locationIds;
    for (const [i, locationId] of [p1, p2].entries()) {
      const scan = expectOk(await api().post(`${V1}/kardex`).set("Authorization", s.guard1.auth).send({ userId: s.guard1.id, locationId, notes: `punto ${i}`, media: photo(i) }), 201);
      expect(scan.scanType).toBe("RECURRING");
    }

    const detail = expectOk(await api().get(`${RD}/${started.id}`).set("Authorization", s.shift.auth));
    expect(detail.timeline.map((t: any) => t.type)).toEqual(["START", "SCAN", "SCAN"]);
    expect(detail.round.recurringConfiguration.recurringLocations).toHaveLength(3);

    const ended = expectOk(await api().put(`${RD}/${started.id}/end`).set("Authorization", s.guard1.auth));
    expect(ended).toMatchObject({ status: "COMPLETED" });
    expect(ended.endTime).toBeTruthy();
    expect(expectOk(await api().get(`${RD}/${started.id}`).set("Authorization", s.admin.auth)).timeline.map((t: any) => t.type)).toEqual(["START", "SCAN", "SCAN", "END"]);

    const table = expectOk(await api().post(`${RD}/datatable`).set("Authorization", s.admin.auth).send({ page: 1, limit: 10, filters: { guard: String(s.guard1.id) } }));
    const row = table.rows.find((r: any) => r.id === started.id);
    expect(row).toMatchObject({ scannedCount: 2, totalLocations: 3, progressPercent: 67, progressStatus: "ALTO" });

    const list = expectOk(await api().get(`${RD}?guardId=${s.guard1.id}`).set("Authorization", s.admin.auth));
    expect(list.length).toBeGreaterThanOrEqual(2);
    expect(list.every((r: any) => r.guardId === s.guard1.id)).toBe(true);
    expect(expectOk(await api().get(`${RD}?date=2020-01-01`).set("Authorization", s.admin.auth))).toEqual([]);
  });

  it("sin ruta indicada: con una sola ruta asignada se usa esa; con varias hay que elegir; sin rutas es una ronda libre", async () => {
    const auto = expectOk(await api().post(`${RD}/start`).set("Authorization", s.guard1.auth).send({}));
    expect(auto.recurringConfigurationId).toBe(flows.routes.configurationId);
    await prisma.round.updateMany({ data: { status: "COMPLETED" } });

    const second = await prisma.recurringConfiguration.create({ data: { title: "Otra ruta", guards: { connect: [{ id: s.guard1.id }] } } });
    const ambiguous = await api().post(`${RD}/start`).set("Authorization", s.guard1.auth).send({});
    expectFail(ambiguous, 400);
    expect(ambiguous.body.messages.join(" ")).toMatch(/qué ruta/);
    expectOk(await api().post(`${RD}/start`).set("Authorization", s.guard1.auth).send({ recurringConfigId: second.id }));

    const free = expectOk(await api().post(`${RD}/start`).set("Authorization", s.maint.auth).send({}));
    expect(free.recurringConfigurationId).toBeNull();
  });

  it("reglas de inicio: ruta ajena, ruta ocupada por otro guardia y ronda activa de la misma ruta", async () => {
    const mine = await prisma.recurringConfiguration.create({ data: { title: "Solo guardia 2", guards: { connect: [{ id: s.guard2.id }] } } });
    const notMine = await api().post(`${RD}/start`).set("Authorization", s.guard1.auth).send({ recurringConfigId: mine.id });
    expectFail(notMine, 400);
    expect(notMine.body.messages.join(" ")).toMatch(/No tienes asignada/);

    expectOk(await api().post(`${RD}/start`).set("Authorization", s.guard1.auth).send({ recurringConfigId: flows.routes.configurationId }));
    const busy = await api().post(`${RD}/start`).set("Authorization", s.guard2.auth).send({ recurringConfigId: flows.routes.configurationId });
    expectFail(busy, 400);
    expect(busy.body.messages.join(" ")).toMatch(/ya está siendo recorrida/);
    const again = await api().post(`${RD}/start`).set("Authorization", s.guard1.auth).send({ recurringConfigId: flows.routes.configurationId });
    expectFail(again, 400);
    expect(again.body.messages.join(" ")).toMatch(/ronda activa/);
    expect(await prisma.round.count({ where: { status: "IN_PROGRESS" } })).toBe(1);
  });

  it("al iniciar otra ruta se cierra la anterior; una ronda de más de 14 h se cierra sola", async () => {
    const second = await prisma.recurringConfiguration.create({ data: { title: "Otra", guards: { connect: [{ id: s.guard1.id }] } } });
    const first = expectOk(await api().post(`${RD}/start`).set("Authorization", s.guard1.auth).send({ recurringConfigId: flows.routes.configurationId }));
    expectOk(await api().post(`${RD}/start`).set("Authorization", s.guard1.auth).send({ recurringConfigId: second.id }));
    expect((await prisma.round.findUniqueOrThrow({ where: { id: first.id } })).status).toBe("COMPLETED");

    await prisma.round.deleteMany();
    await prisma.round.create({ data: { guardId: s.guard1.id, status: "IN_PROGRESS", startTime: new Date(Date.now() - 15 * 3600_000) } });
    expect(expectOk(await api().get(`${RD}/current`).set("Authorization", s.guard1.auth))).toBeNull();
    expect(await prisma.round.count({ where: { guardId: s.guard1.id, status: "IN_PROGRESS" } })).toBe(0);
  });

  it("ronda actual: sin ronda hoy → data null; id de la ronda en el cuerpo se ignora", async () => {
    await prisma.round.deleteMany();
    expect(expectOk(await api().get(`${RD}/current`).set("Authorization", s.guard1.auth))).toBeNull();
    const started = expectOk(await api().post(`${RD}/start`).set("Authorization", s.guard1.auth).send({ guardId: s.guard2.id, userId: s.guard2.id }));
    expect(started.guardId).toBe(s.guard1.id);
  });

  it("terminar: solo el dueño o un supervisor; dos veces → 400; inexistente → 400 sin filtrar", async () => {
    const started = expectOk(await api().post(`${RD}/start`).set("Authorization", s.guard1.auth).send({}));
    expectFail(await api().put(`${RD}/${started.id}/end`).set("Authorization", s.guard2.auth), 403);
    expectFail(await api().put(`${RD}/${started.id}/end`).set("Authorization", s.maint.auth), 403);
    expectOk(await api().put(`${RD}/${started.id}/end`).set("Authorization", s.shift.auth));
    const twice = await api().put(`${RD}/${started.id}/end`).set("Authorization", s.guard1.auth);
    expectFail(twice, 400);
    expect(twice.body.messages.join(" ")).toMatch(/ya ha finalizado/);
    expectFail(await api().put(`${RD}/${MISSING_ID}/end`).set("Authorization", s.admin.auth), 400);
    const bad = await api().put(`${RD}/abc/end`).set("Authorization", s.admin.auth);
    expect(bad.status).toBeLessThan(500);
    expect(bad.body.success).toBe(false);
  });

  it("detalle de ronda inexistente → 404; id no numérico no produce 500", async () => {
    expectFail(await api().get(`${RD}/${MISSING_ID}`).set("Authorization", s.admin.auth), 404);
    const bad = await api().get(`${RD}/abc`).set("Authorization", s.admin.auth);
    expect(bad.status).toBeLessThan(500);
    expect(bad.body.success).toBe(false);
  });

  it("valida el cuerpo de inicio: ruta no numérica → 400", async () => {
    expectFail(await api().post(`${RD}/start`).set("Authorization", s.guard1.auth).send({ recurringConfigId: "abc" }), 400, "VALIDATION_ERROR");
    expectFail(await api().post(`${RD}/start`).set("Authorization", s.guard1.auth).send({ recurringConfigId: MISSING_ID }), 400);
  });

  it("datatable: filtros por ruta, búsqueda por guardia y fecha; entradas raras no dan 500", async () => {
    const byRoute = expectOk(await api().post(`${RD}/datatable`).set("Authorization", s.admin.auth).send({ page: 1, limit: 10, filters: { recurringConfiguration: String(flows.routes.configurationId) } }));
    expect(byRoute.total).toBe(1);
    const search = expectOk(await api().post(`${RD}/datatable`).set("Authorization", s.admin.auth).send({ page: 1, limit: 10, filters: { search: "gabriela" } }));
    expect(search.total).toBe(1);
    const today = new Date().toISOString().slice(0, 10);
    const dated = expectOk(await api().post(`${RD}/datatable`).set("Authorization", s.admin.auth).send({ page: 1, limit: 10, filters: { date: [`${today}T00:00:00.000Z`, `${today}T23:59:59.999Z`] } }));
    expect(dated.total).toBe(1);
    for (const body of [{}, { filters: { campoRaro: "x" } }, { page: 1, limit: 10, filters: { guard: "abc" } }]) {
      expect((await api().post(`${RD}/datatable`).set("Authorization", s.admin.auth).send(body)).status).toBeLessThan(500);
    }
  });

  it("los residentes no inician, terminan ni consultan rondas → 403; sin token → 401", async () => {
    expectFail(await api().post(`${RD}/start`).set("Authorization", s.resident.auth).send({}), 403);
    expectFail(await api().get(`${RD}/current`).set("Authorization", s.resident.auth), 403);
    expectFail(await api().get(RD).set("Authorization", s.resident.auth), 403);
    expectFail(await api().get(`${RD}/${flows.routes.completedRoundId}`).set("Authorization", s.resident.auth), 403);
    expectFail(await api().post(`${RD}/datatable`).set("Authorization", s.resident.auth).send({}), 403);
    expectFail(await api().get(`${RD}/current`), 401);
  });
});

describe("bitácora (kardex)", () => {
  const K = `${V1}/kardex`;

  it("camino feliz: registrar → leer → editar → listar → datatable → quitar evidencia → borrar", async () => {
    const [p1] = flows.routes.locationIds;
    const created = expectOk(
      await api().post(K).set("Authorization", s.guard2.auth).send({ userId: s.guard2.id, locationId: String(p1), notes: "Sin novedad", media: photo(), latitude: "32.5", longitude: -117.01 }),
      201,
    );
    expect(created).toMatchObject({ userId: s.guard2.id, locationId: p1, scanType: "RECURRING", latitude: 32.5, longitude: -117.01 });

    const detail = expectOk(await api().get(`${K}/${created.id}`).set("Authorization", s.guard2.auth));
    expect(detail.user).toMatchObject({ id: s.guard2.id, username: "flow_guard2" });
    expect(detail.assignment.tasks.map((t: any) => t.description)).toEqual(expect.arrayContaining(["Verificar candados"]));
    expect(JSON.stringify(detail)).not.toMatch(/password/);

    expectOk(await api().patch(`${K}/${created.id}`).set("Authorization", s.guard2.auth).send({ notes: "Corregido", latitude: "" }));
    expect((await prisma.kardex.findUniqueOrThrow({ where: { id: created.id } })).notes).toBe("Corregido");

    const list = expectOk(await api().get(`${K}?userId=${s.guard2.id}`).set("Authorization", s.shift.auth));
    expect(list.map((k: any) => k.id)).toEqual([created.id]);
    const table = expectOk(await api().post(`${K}/datatable`).set("Authorization", s.admin.auth).send({ page: 1, limit: 10, filters: { search: "gonzalo" }, sort: { key: "user", order: "asc" } }));
    expect(table.total).toBe(1);

    expectOk(await api().delete(`${K}/${created.id}/media?key=p1.jpg`).set("Authorization", s.shift.auth));
    expect((await prisma.kardex.findUniqueOrThrow({ where: { id: created.id } })).media).toEqual([]);
    expectOk(await api().delete(`${K}/${created.id}`).set("Authorization", s.admin.auth));
    expect(await prisma.kardex.findUnique({ where: { id: created.id } })).toBeNull();
  });

  it("clasifica el escaneo: asignación activa > ruta recurrente > libre, y avanza la asignación", async () => {
    const [, , , free] = flows.routes.locationIds; // punto 4: solo tiene la asignación del guardia 2
    const withAssignment = expectOk(await api().post(K).set("Authorization", s.guard2.auth).send({ userId: s.guard2.id, locationId: free, notes: "Revisado", media: photo() }), 201);
    expect(withAssignment).toMatchObject({ scanType: "ASSIGNMENT", assignmentId: flows.routes.assignmentId });
    expect((await prisma.assignment.findUniqueOrThrow({ where: { id: flows.routes.assignmentId } })).status).toBe("CHECKING");

    const loose = await prisma.location.create({ data: { aisle: "X", spot: "1", number: "1", name: "Suelta" } });
    expect(expectOk(await api().post(K).set("Authorization", s.guard1.auth).send({ userId: s.guard1.id, locationId: loose.id }), 201).scanType).toBe("FREE");
  });

  it.each([
    ["sin userId", { locationId: 1 }],
    ["sin locationId", { userId: 1 }],
    ["ids no numéricos", { userId: "a", locationId: "b" }],
    ["latitud fuera de rango", { userId: 1, locationId: 1, latitude: 91 }],
    ["longitud como texto", { userId: 1, locationId: 1, longitude: "oeste" }],
    ["notas enormes", { userId: 1, locationId: 1, notes: "x".repeat(2001) }],
    ["media no es arreglo", { userId: 1, locationId: 1, media: "foto.jpg" }],
  ])("valida la entrada: %s → 400", async (_n, body) => {
    const before = await prisma.kardex.count();
    expectFail(await api().post(K).set("Authorization", s.guard1.auth).send(body), 400);
    expect(await prisma.kardex.count()).toBe(before);
  });

  it("ubicación o usuario inexistente → 4xx sin filtrar detalles de la base", async () => {
    const [p1] = flows.routes.locationIds;
    expectFail(await api().post(K).set("Authorization", s.admin.auth).send({ userId: s.guard1.id, locationId: MISSING_ID }), 400);
    expectFail(await api().post(K).set("Authorization", s.admin.auth).send({ userId: MISSING_ID, locationId: p1 }), 400);
  });

  it("nadie registra ni edita escaneos de otra persona, salvo la supervisión", async () => {
    const [p1] = flows.routes.locationIds;
    expectFail(await api().post(K).set("Authorization", s.guard1.auth).send({ userId: s.guard2.id, locationId: p1, notes: "suplantado" }), 403);
    expectFail(await api().post(K).set("Authorization", s.maint.auth).send({ userId: s.guard2.id, locationId: p1 }), 403);
    expect(await prisma.kardex.count({ where: { notes: "suplantado" } })).toBe(0);
    expectOk(await api().post(K).set("Authorization", s.shift.auth).send({ userId: s.guard2.id, locationId: p1, notes: "capturado por supervisión" }), 201);

    const mine = flows.reports.kardexId; // del guardia 1
    expectFail(await api().patch(`${K}/${mine}`).set("Authorization", s.guard2.auth).send({ notes: "alterado" }), 403);
    expect((await prisma.kardex.findUniqueOrThrow({ where: { id: mine } })).notes).toBe("Flujo · punto revisado");
    expectOk(await api().patch(`${K}/${mine}`).set("Authorization", s.guard1.auth).send({ notes: "mío" }));
    expectOk(await api().patch(`${K}/${mine}`).set("Authorization", s.admin.auth).send({ notes: "de admin" }));
  });

  it("leer/editar/borrar un id inexistente → 404; id no numérico → 400", async () => {
    expectFail(await api().get(`${K}/${MISSING_ID}`).set("Authorization", s.admin.auth), 404);
    expectFail(await api().patch(`${K}/${MISSING_ID}`).set("Authorization", s.admin.auth).send({ notes: "x" }), 404);
    expectFail(await api().delete(`${K}/${MISSING_ID}`).set("Authorization", s.admin.auth), 404);
    expectFail(await api().get(`${K}/abc`).set("Authorization", s.admin.auth), 400);
    expectFail(await api().patch(`${K}/abc`).set("Authorization", s.admin.auth).send({ notes: "x" }), 400, "VALIDATION_ERROR");
  });

  it("evidencia: falta el key → 400; registro sin media o inexistente → 404", async () => {
    expectFail(await api().delete(`${K}/${flows.reports.kardexId}/media`).set("Authorization", s.admin.auth), 400);
    expectFail(await api().delete(`${K}/${MISSING_ID}/media?key=x`).set("Authorization", s.admin.auth), 404);
    const bare = await prisma.kardex.create({ data: { userId: s.guard1.id, locationId: flows.routes.locationIds[0] } });
    expectFail(await api().delete(`${K}/${bare.id}/media?key=x`).set("Authorization", s.admin.auth), 404);
  });

  it("listados: filtros inválidos no producen 500 y el tope de filas se respeta", async () => {
    for (const q of ["startDate=hoy&endDate=ayer", "userId=abc", "locationId=xyz"]) {
      expect((await api().get(`${K}?${q}`).set("Authorization", s.admin.auth)).status).toBeLessThan(500);
    }
    for (const body of [{}, { page: 1, limit: 10, filters: { date: ["no-fecha"] } }, { page: -1, limit: 10, filters: {}, sort: { key: "noExiste", order: "asc" } }]) {
      expect((await api().post(`${K}/datatable`).set("Authorization", s.admin.auth).send(body)).status).toBeLessThan(500);
    }
  });

  it("solo ADMIN y SHIFT borran; los residentes no ven la bitácora; sin token → 401", async () => {
    for (const key of ["guard1", "maint", "resident"]) {
      expectFail(await api().delete(`${K}/${flows.reports.kardexId}`).set("Authorization", s[key].auth), 403);
      expectFail(await api().delete(`${K}/${flows.reports.kardexId}/media?key=x`).set("Authorization", s[key].auth), 403);
    }
    expectFail(await api().get(K).set("Authorization", s.resident.auth), 403);
    expectFail(await api().get(`${K}/${flows.reports.kardexId}`).set("Authorization", s.resident.auth), 403);
    expectFail(await api().post(`${K}/datatable`).set("Authorization", s.resident.auth).send({}), 403);
    expectFail(await api().get(K), 401);
  });
});

describe("asignaciones puntuales", () => {
  const A = `${V1}/assignments`;

  it("camino feliz: asignar → ver las mías → completar tarea → pasar por los estados → listar", async () => {
    const [p1] = flows.routes.locationIds;
    const created = expectOk(
      await api().post(A).set("Authorization", s.shift.auth).send({ guardId: String(s.guard1.id), locationId: p1, notes: "Revisar candado", tasks: [{ description: "Foto del candado", reqPhoto: "true" }, { description: "Anotar folio" }] }),
      201,
    );
    expect(created).toMatchObject({ guardId: s.guard1.id, locationId: p1, status: "PENDING", assignedBy: s.shift.id });
    expect(created.tasks.map((t: any) => [t.description, t.reqPhoto])).toEqual([["Foto del candado", true], ["Anotar folio", false]]);

    const mine = expectOk(await api().get(`${A}/me`).set("Authorization", s.guard1.auth));
    expect(mine.map((a: any) => a.id)).toEqual([created.id]);

    const task = created.tasks[0];
    expect(expectOk(await api().patch(`${A}/tasks/${task.id}/toggle`).set("Authorization", s.guard1.auth)).completed).toBe(true);
    const undone = expectOk(await api().patch(`${A}/tasks/${task.id}/toggle`).set("Authorization", s.guard1.auth));
    expect(undone).toMatchObject({ completed: false, completedAt: null });

    for (const status of ["CHECKING", "UNDER_REVIEW", "ANOMALY", "REVIEWED"]) {
      expect(expectOk(await api().patch(`${A}/${created.id}/status`).set("Authorization", s.admin.auth).send({ status })).status).toBe(status);
    }
    expect(expectOk(await api().get(`${A}/me`).set("Authorization", s.guard1.auth))).toEqual([]);

    const all = expectOk(await api().get(`${A}?guardId=${s.guard1.id}&status=REVIEWED`).set("Authorization", s.admin.auth));
    expect(all.map((a: any) => a.id)).toEqual([created.id]);
    expect(JSON.stringify(all)).not.toMatch(/password/);
    expect(expectOk(await api().get(`${A}/all`).set("Authorization", s.shift.auth)).length).toBeGreaterThanOrEqual(2);
    const table = expectOk(await api().post(`${A}/datatable`).set("Authorization", s.admin.auth).send({ page: 1, limit: 10, filters: {} }));
    expect(table.total).toBe(2);
  });

  it.each([
    ["sin guardia", { locationId: 1 }],
    ["sin ubicación", { guardId: 1 }],
    ["tarea sin descripción", { guardId: 1, locationId: 1, tasks: [{ description: "" }] }],
    ["notas enormes", { guardId: 1, locationId: 1, notes: "x".repeat(2001) }],
    ["ids no numéricos", { guardId: "a", locationId: "b" }],
  ])("valida la entrada: %s → 400", async (_n, body) => {
    expectFail(await api().post(A).set("Authorization", s.admin.auth).send(body), 400, "VALIDATION_ERROR");
  });

  it("reglas de negocio: solo personal operativo, sin duplicados activos, ubicación existente", async () => {
    const [p1, , , p4] = flows.routes.locationIds;
    expectFail(await api().post(A).set("Authorization", s.admin.auth).send({ guardId: s.resident.id, locationId: p1 }), 400);
    expectFail(await api().post(A).set("Authorization", s.admin.auth).send({ guardId: MISSING_ID, locationId: p1 }), 400);
    const dup = await api().post(A).set("Authorization", s.admin.auth).send({ guardId: s.guard2.id, locationId: p4 });
    expectFail(dup, 409);
    expect(dup.body.messages.join(" ")).toMatch(/ya tiene una asignación activa/);
    expectFail(await api().post(A).set("Authorization", s.admin.auth).send({ guardId: s.guard1.id, locationId: MISSING_ID }), 404);
  });

  it("transiciones inválidas → 409; estado desconocido → 400; asignación inexistente → 404", async () => {
    const id = flows.routes.assignmentId;
    const bad = await api().patch(`${A}/${id}/status`).set("Authorization", s.admin.auth).send({ status: "REVIEWED" });
    expectFail(bad, 409, "INVALID_TRANSITION");
    expectFail(await api().patch(`${A}/${id}/status`).set("Authorization", s.admin.auth).send({ status: "TERMINADA" }), 400, "VALIDATION_ERROR");
    expectFail(await api().patch(`${A}/${id}/status`).set("Authorization", s.admin.auth).send({}), 400, "VALIDATION_ERROR");
    expectFail(await api().patch(`${A}/${MISSING_ID}/status`).set("Authorization", s.admin.auth).send({ status: "CHECKING" }), 404, "ASSIGNMENT_NOT_FOUND");
    expect((await prisma.assignment.findUniqueOrThrow({ where: { id } })).status).toBe("PENDING");
    await prisma.assignment.update({ where: { id }, data: { status: "REVIEWED" } });
    expectFail(await api().patch(`${A}/${id}/status`).set("Authorization", s.admin.auth).send({ status: "CHECKING" }), 409, "INVALID_TRANSITION");
  });

  it("cada quien completa solo SUS tareas (la supervisión puede con todas); tarea inexistente → 404", async () => {
    const task = await prisma.assignmentTask.findFirstOrThrow({ where: { assignmentId: flows.routes.assignmentId } });
    expectFail(await api().patch(`${A}/tasks/${task.id}/toggle`).set("Authorization", s.guard1.auth), 403);
    expectFail(await api().patch(`${A}/tasks/${task.id}/toggle`).set("Authorization", s.resident.auth), 403);
    expect((await prisma.assignmentTask.findUniqueOrThrow({ where: { id: task.id } })).completed).toBe(false);
    expectOk(await api().patch(`${A}/tasks/${task.id}/toggle`).set("Authorization", s.guard2.auth));
    expectOk(await api().patch(`${A}/tasks/${task.id}/toggle`).set("Authorization", s.shift.auth));
    expectFail(await api().patch(`${A}/tasks/${MISSING_ID}/toggle`).set("Authorization", s.guard2.auth), 404);
    const bad = await api().patch(`${A}/tasks/abc/toggle`).set("Authorization", s.guard2.auth);
    expect(bad.status).toBeLessThan(500);
    expect(bad.body.success).toBe(false);
  });

  it("filtros de listado inválidos no producen 500", async () => {
    for (const q of ["status=NOEXISTE", "guardId=abc", "id=xyz"]) {
      expect((await api().get(`${A}?${q}`).set("Authorization", s.admin.auth)).status).toBeLessThan(500);
    }
  });

  it("gestión solo ADMIN y SHIFT; GUARD, MAINT y residentes → 403; /me sin token → 401", async () => {
    for (const key of ["guard1", "maint", "resident"]) {
      expectFail(await api().post(A).set("Authorization", s[key].auth).send({ guardId: s.guard1.id, locationId: flows.routes.locationIds[0] }), 403);
      expectFail(await api().get(A).set("Authorization", s[key].auth), 403);
      expectFail(await api().get(`${A}/all`).set("Authorization", s[key].auth), 403);
      expectFail(await api().post(`${A}/datatable`).set("Authorization", s[key].auth).send({}), 403);
      expectFail(await api().patch(`${A}/${flows.routes.assignmentId}/status`).set("Authorization", s[key].auth).send({ status: "CHECKING" }), 403);
    }
    expectFail(await api().get(`${A}/me`), 401);
    expectFail(await api().get(`${A}/me`).set("Authorization", s.resident.auth), 403);
  });
});
