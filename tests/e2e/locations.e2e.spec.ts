/**
 * Flujo: ubicaciones (puntos de ronda) y horarios de turno.
 */
import { FLOW_LOCATIONS } from "../../prisma/seeds/flows";
import { api, allSessions, bootFlows, disconnectDatabase, expectFail, expectOk, MISSING_ID, prisma, Session, V1 } from "./support";
import { FlowsResult } from "../../prisma/seeds/flows";

let flows: FlowsResult;
let s: Record<string, Session>;

beforeEach(async () => {
  flows = await bootFlows();
  s = await allSessions();
});
afterAll(disconnectDatabase);

const L = `${V1}/locations`;

describe("ubicaciones", () => {
  it("camino feliz: crear (estructurada y solo nombre) → listar → datatable → editar → borrar", async () => {
    const created = expectOk(await api().post(L).set("Authorization", s.admin.auth).send({ aisle: "A", spot: "B", number: "7" }), 201);
    expect(created).toMatchObject({ aisle: "A", spot: "B", number: "7", name: "A-B-7", active: true, softDelete: false });
    const legacy = expectOk(await api().post(L).set("Authorization", s.shift.auth).send({ name: "Bodega norte" }), 201);
    expect(legacy).toMatchObject({ name: "Bodega norte", aisle: "Bodega norte", spot: "", number: "" });

    const list = expectOk(await api().get(L).set("Authorization", s.guard1.auth));
    expect(list).toHaveLength(FLOW_LOCATIONS.length + 2);

    const table = expectOk(await api().post(`${L}/datatable`).set("Authorization", s.admin.auth).send({ page: 1, limit: 3, filters: {} }));
    expect(table.total).toBe(FLOW_LOCATIONS.length + 2);
    expect(table.rows).toHaveLength(3);

    const updated = expectOk(await api().put(`${L}/${created.id}`).set("Authorization", s.admin.auth).send({ name: "Pasillo A", number: "8" }));
    expect(updated).toMatchObject({ name: "Pasillo A", number: "8", aisle: "A" });

    expectOk(await api().delete(`${L}/${created.id}`).set("Authorization", s.admin.auth));
    expect(await prisma.location.findUnique({ where: { id: created.id } })).toBeNull();
  });

  it("datatable: la búsqueda ignora acentos y mayúsculas", async () => {
    await prisma.location.create({ data: { aisle: "J", spot: "1", number: "1", name: "Jardín de niños" } });
    const res = expectOk(await api().post(`${L}/datatable`).set("Authorization", s.admin.auth).send({ page: 1, limit: 10, filters: { name: "JARDIN" } }));
    expect(res.rows.map((r: any) => r.name)).toEqual(expect.arrayContaining(["Jardín de niños", "Flujo · Jardín central"]));
    const none = expectOk(await api().post(`${L}/datatable`).set("Authorization", s.admin.auth).send({ page: 1, limit: 10, filters: { name: "zzz-no-existe" } }));
    expect(none).toEqual({ rows: [], total: 0 });
  });

  it("las ubicaciones eliminadas no se listan", async () => {
    await prisma.location.update({ where: { id: flows.routes.locationIds[0] }, data: { softDelete: true } });
    const list = expectOk(await api().get(L).set("Authorization", s.admin.auth));
    expect(list.map((l: any) => l.id)).not.toContain(flows.routes.locationIds[0]);
  });

  it.each([
    ["sin datos", {}],
    ["solo pasillo y lugar", { aisle: "A", spot: "B" }],
    ["nombre vacío", { name: "   " }],
    ["nombre demasiado largo", { name: "x".repeat(121) }],
    ["parte demasiado larga", { aisle: "a".repeat(41), spot: "b", number: "1" }],
    ["tipos incorrectos", { name: 123 }],
  ])("valida la entrada al crear: %s → 400", async (_n, body) => {
    const before = await prisma.location.count();
    expectFail(await api().post(L).set("Authorization", s.admin.auth).send(body), 400, "VALIDATION_ERROR");
    expect(await prisma.location.count()).toBe(before);
  });

  it("nombre duplicado → 409 al crear y al editar", async () => {
    expectFail(await api().post(L).set("Authorization", s.admin.auth).send({ name: FLOW_LOCATIONS[0].name }), 409);
    expectFail(await api().put(`${L}/${flows.routes.locationIds[1]}`).set("Authorization", s.admin.auth).send({ name: FLOW_LOCATIONS[0].name }), 409);
  });

  it("editar o borrar un id inexistente → 404; id no numérico → 400", async () => {
    expectFail(await api().put(`${L}/${MISSING_ID}`).set("Authorization", s.admin.auth).send({ name: "X" }), 404);
    expectFail(await api().delete(`${L}/${MISSING_ID}`).set("Authorization", s.admin.auth), 404);
    expectFail(await api().put(`${L}/abc`).set("Authorization", s.admin.auth).send({ name: "X" }), 400, "VALIDATION_ERROR");
    const bad = await api().delete(`${L}/abc`).set("Authorization", s.admin.auth);
    expect(bad.status).toBeGreaterThanOrEqual(400);
    expect(bad.status).toBeLessThan(500);
  });

  it("borrar una ubicación la quita de las rutas recurrentes, pero no si ya tiene bitácora", async () => {
    // Punto 3 de la ruta, sin escaneos: se puede borrar y sale de la ruta.
    const [, , third] = flows.routes.locationIds;
    expectOk(await api().delete(`${L}/${third}`).set("Authorization", s.admin.auth));
    expect(await prisma.recurringLocation.count({ where: { configurationId: flows.routes.configurationId } })).toBe(2);
    // Punto 1: tiene escaneos en la ronda terminada → 409, no se pierde historial.
    const [first] = flows.routes.locationIds;
    expectFail(await api().delete(`${L}/${first}`).set("Authorization", s.admin.auth), 409);
    expect(await prisma.location.findUnique({ where: { id: first } })).not.toBeNull();
  });

  it("solo ADMIN y SHIFT escriben; GUARD, MAINT y residentes → 403", async () => {
    for (const key of ["guard1", "maint", "resident"]) {
      expectFail(await api().post(L).set("Authorization", s[key].auth).send({ name: "Hack" }), 403);
      expectFail(await api().put(`${L}/${flows.routes.locationIds[0]}`).set("Authorization", s[key].auth).send({ name: "Hack" }), 403);
      expectFail(await api().delete(`${L}/${flows.routes.locationIds[0]}`).set("Authorization", s[key].auth), 403);
    }
    expectOk(await api().post(L).set("Authorization", s.shift.auth).send({ name: "Puesto de SHIFT" }), 201);
  });

  it("sin token → 401", async () => {
    expectFail(await api().get(L), 401);
    expectFail(await api().post(`${L}/datatable`).send({}), 401);
  });
});

describe("horarios de turno", () => {
  const S = `${V1}/schedules`;

  it("camino feliz: crear → listar activos → datatable → editar → desactivar → borrar", async () => {
    const created = expectOk(await api().post(S).set("Authorization", s.admin.auth).send({ name: "Mixto", startTime: "9:30", endTime: "17:30" }), 201);
    expect(created).toMatchObject({ name: "Mixto", active: true });
    expect(expectOk(await api().get(S).set("Authorization", s.guard1.auth)).map((x: any) => x.name)).toContain("Mixto");
    expect(expectOk(await api().post(`${S}/datatable`).set("Authorization", s.shift.auth).send({ page: 1, limit: 10, filters: {} })).total).toBe(2);

    expectOk(await api().put(`${S}/${created.id}`).set("Authorization", s.admin.auth).send({ endTime: "18:00", active: "false" }));
    expect(expectOk(await api().get(S).set("Authorization", s.admin.auth)).map((x: any) => x.name)).not.toContain("Mixto");
    expect(await prisma.schedule.findUniqueOrThrow({ where: { id: created.id } })).toMatchObject({ endTime: "18:00", active: false });

    expectOk(await api().delete(`${S}/${created.id}`).set("Authorization", s.admin.auth));
    expect(await prisma.schedule.findUnique({ where: { id: created.id } })).toBeNull();
  });

  it.each([
    ["sin nombre", { startTime: "08:00", endTime: "16:00" }],
    ["hora inválida", { name: "X", startTime: "25:00", endTime: "16:00" }],
    ["minutos inválidos", { name: "X", startTime: "08:60", endTime: "16:00" }],
    ["formato libre", { name: "X", startTime: "ocho", endTime: "16:00" }],
    ["nombre largo", { name: "x".repeat(61), startTime: "08:00", endTime: "16:00" }],
  ])("valida la entrada: %s → 400", async (_n, body) => {
    expectFail(await api().post(S).set("Authorization", s.admin.auth).send(body), 400, "VALIDATION_ERROR");
  });

  it("nombre duplicado → 400 con mensaje claro; editar inexistente → 404", async () => {
    const dup = await api().post(S).set("Authorization", s.admin.auth).send({ name: "Turno completo (flujos)", startTime: "01:00", endTime: "02:00" });
    expectFail(dup, 400);
    expect(dup.body.messages.join(" ")).toMatch(/Ya existe/);
    expectFail(await api().put(`${S}/${MISSING_ID}`).set("Authorization", s.admin.auth).send({ name: "X" }), 404);
    expectFail(await api().delete(`${S}/${MISSING_ID}`).set("Authorization", s.admin.auth), 404);
  });

  it("un horario asignado a personal no se puede borrar", async () => {
    const res = await api().delete(`${S}/${flows.staff.scheduleId}`).set("Authorization", s.admin.auth);
    expectFail(res, 400);
    expect(res.body.messages.join(" ")).toMatch(/asignado/);
  });

  it("solo ADMIN escribe", async () => {
    for (const key of ["shift", "guard1", "maint", "resident"]) {
      expectFail(await api().post(S).set("Authorization", s[key].auth).send({ name: "Hack", startTime: "01:00", endTime: "02:00" }), 403);
      expectFail(await api().delete(`${S}/${flows.staff.scheduleId}`).set("Authorization", s[key].auth), 403);
    }
  });
});
