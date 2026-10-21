/**
 * Flujo: propiedades, ocupación, cambio de propietario e importación masiva.
 */
import { api, allSessions, bootFlows, disconnectDatabase, expectFail, expectOk, MISSING_ID, prisma, Session, V1 } from "./support";
import { FlowsResult } from "../../prisma/seeds/flows";

let flows: FlowsResult;
let s: Record<string, Session>;
let casa: number;
let vacante: number;

beforeEach(async () => {
  flows = await bootFlows();
  s = await allSessions();
  casa = (await prisma.propertyType.findUniqueOrThrow({ where: { name: "CASA" } })).id;
  vacante = (await prisma.propertyStatus.findUniqueOrThrow({ where: { name: "VACNT" } })).id;
});
afterAll(disconnectDatabase);

const P = `${V1}/properties`;
const newProperty = (over: Record<string, unknown> = {}) => ({
  identifier: "NUEVA-01", name: "Casa Nueva", mainStreet: "Calle Prueba 500", betweenStreets: "Entre A y B",
  latitude: "32.5", longitude: -117.01, ...over,
});

describe("propiedades", () => {
  it("camino feliz: crear → leer → listar → datatable → editar → baja lógica", async () => {
    const created = expectOk(await api().post(P).set("Authorization", s.admin.auth).send(newProperty({ typeId: String(casa), statusId: vacante })), 201);
    expect(created).toMatchObject({ identifier: "NUEVA-01", residentCount: 0, active: true, latitude: 32.5 });
    const period = await prisma.occupancyPeriod.findFirstOrThrow({ where: { propertyId: created.id } });
    expect(period.endDate).toBeNull();

    const detail = expectOk(await api().get(`${P}/${created.id}`).set("Authorization", s.shift.auth));
    expect(detail).toMatchObject({ id: created.id, type: { name: "CASA" }, status: { name: "VACNT" } });
    expect(JSON.stringify(detail)).not.toMatch(/password/);

    const list = expectOk(await api().get(P).set("Authorization", s.shift.auth));
    expect(list).toHaveLength(4);
    const table = expectOk(await api().post(`${P}/datatable`).set("Authorization", s.admin.auth).send({ page: 1, limit: 2, filters: {} }));
    expect(table).toMatchObject({ total: 4 });
    expect(table.rows).toHaveLength(2);
    const search = expectOk(await api().post(`${P}/datatable`).set("Authorization", s.admin.auth).send({ page: 1, limit: 10, filters: { name: "nueva" } }));
    expect(search.rows.map((r: any) => r.identifier)).toEqual(["NUEVA-01"]);

    expect(expectOk(await api().put(`${P}/${created.id}`).set("Authorization", s.admin.auth).send({ name: "Casa Renovada", maxResidents: 5, floor: 2 }))).toMatchObject({ name: "Casa Renovada", maxResidents: 5, floor: 2, identifier: "NUEVA-01" });

    expectOk(await api().delete(`${P}/${created.id}`).set("Authorization", s.admin.auth));
    expect(expectOk(await api().get(P).set("Authorization", s.admin.auth)).map((p: any) => p.id)).not.toContain(created.id);
    expectFail(await api().get(`${P}/${created.id}`).set("Authorization", s.admin.auth), 404);
  });

  it("la ocupación y el propietario no se cambian por el alta ni la edición (solo por sus endpoints)", async () => {
    const created = expectOk(await api().post(P).set("Authorization", s.admin.auth).send(newProperty({ typeId: casa, statusId: vacante, residentCount: 99, ownerPersonId: flows.properties.ownerPersonId, occupancyStatusId: 2 })), 201);
    expect(created.residentCount).toBe(0);
    expect(created.ownerPersonId).toBeNull();
    const updated = expectOk(await api().put(`${P}/${created.id}`).set("Authorization", s.admin.auth).send({ residentCount: 50, ownerPersonId: flows.properties.ownerPersonId, softDelete: true }));
    expect(updated).toMatchObject({ residentCount: 0, ownerPersonId: null, softDelete: false });
  });

  it.each([
    ["sin identificador", { identifier: undefined }],
    ["identificador vacío", { identifier: "  " }],
    ["identificador largo", { identifier: "x".repeat(41) }],
    ["sin nombre", { name: undefined }],
    ["sin calle", { mainStreet: undefined }],
    ["sin tipo", { typeId: undefined }],
    ["tipo no numérico", { typeId: "casa" }],
    ["latitud fuera de rango", { latitude: 95 }],
    ["longitud no numérica", { longitude: "oeste" }],
  ])("valida la entrada al crear: %s → 400", async (_n, over) => {
    const before = await prisma.property.count();
    expectFail(await api().post(P).set("Authorization", s.admin.auth).send(newProperty({ typeId: casa, statusId: vacante, ...over })), 400, "VALIDATION_ERROR");
    expect(await prisma.property.count()).toBe(before);
  });

  it("identificador repetido → 4xx claro al crear y al editar; tipo o estado inexistente → 4xx", async () => {
    const dup = await api().post(P).set("Authorization", s.admin.auth).send(newProperty({ identifier: "FLUJO-CASA-01", typeId: casa, statusId: vacante }));
    expectFail(dup, 400);
    expect(dup.body.messages.join(" ")).toMatch(/identificador/i);
    const dupEdit = await api().put(`${P}/${flows.properties.vacantId}`).set("Authorization", s.admin.auth).send({ identifier: "FLUJO-CASA-01" });
    expectFail(dupEdit, 400);
    const badType = await api().post(P).set("Authorization", s.admin.auth).send(newProperty({ typeId: MISSING_ID, statusId: vacante }));
    expect(badType.status).toBeGreaterThanOrEqual(400);
    expect(badType.status).toBeLessThan(500);
  });

  it("leer, editar o borrar una propiedad inexistente → 404; id no numérico → 400", async () => {
    expectFail(await api().get(`${P}/${MISSING_ID}`).set("Authorization", s.admin.auth), 404);
    expectFail(await api().put(`${P}/${MISSING_ID}`).set("Authorization", s.admin.auth).send({ name: "X" }), 404);
    expectFail(await api().delete(`${P}/${MISSING_ID}`).set("Authorization", s.admin.auth), 404);
    expectFail(await api().put(`${P}/abc`).set("Authorization", s.admin.auth).send({ name: "X" }), 400, "VALIDATION_ERROR");
    const bad = await api().get(`${P}/abc`).set("Authorization", s.admin.auth);
    expect(bad.status).toBeGreaterThanOrEqual(400);
    expect(bad.status).toBeLessThan(500);
  });

  it("catálogos de apoyo: tipos, estados de ocupación con transiciones y estadísticas", async () => {
    const kinds = expectOk(await api().get(`${P}/kinds`).set("Authorization", s.shift.auth));
    expect(kinds.map((k: any) => k.code)).toEqual(expect.arrayContaining(["HOUSE", "APARTMENT", "LOT"]));
    const statuses = expectOk(await api().get(`${P}/occupancy-statuses`).set("Authorization", s.shift.auth));
    expect(statuses.find((x: any) => x.code === "VACANT").allowedNext).toEqual(expect.arrayContaining(["OWNER_OCCUPIED", "RENTED"]));
    const stats = expectOk(await api().get(`${P}/stats/occupancy`).set("Authorization", s.admin.auth));
    expect(stats).toMatchObject({ properties: 3, residents: 1, overcrowded: 0 });
    expect(stats.byStatus.find((x: any) => x.code === "RENTED").count).toBe(1);
  });

  it("permisos: lectura ADMIN/SHIFT; escritura solo ADMIN; GUARD, MAINT y residentes sin acceso", async () => {
    for (const key of ["guard1", "maint", "resident"]) {
      expectFail(await api().get(P).set("Authorization", s[key].auth), 403);
      expectFail(await api().get(`${P}/${flows.properties.houseId}`).set("Authorization", s[key].auth), 403);
      expectFail(await api().get(`${P}/kinds`).set("Authorization", s[key].auth), 403);
      expectFail(await api().post(P).set("Authorization", s[key].auth).send(newProperty({ typeId: casa, statusId: vacante })), 403);
    }
    expectFail(await api().post(P).set("Authorization", s.shift.auth).send(newProperty({ typeId: casa, statusId: vacante })), 403);
    expectFail(await api().put(`${P}/${flows.properties.houseId}`).set("Authorization", s.shift.auth).send({ name: "X" }), 403);
    expectFail(await api().delete(`${P}/${flows.properties.houseId}`).set("Authorization", s.shift.auth), 403);
    expectFail(await api().get(P), 401);
  });

  it("el listado de propiedades con residentes no está abierto a los residentes", async () => {
    expectFail(await api().post(`${P}/datatable`).set("Authorization", s.resident.auth).send({ page: 1, limit: 10, filters: {} }), 403);
    expectOk(await api().post(`${P}/datatable`).set("Authorization", s.guard1.auth).send({ page: 1, limit: 10, filters: {} }));
  });

  it("datatable: entradas raras no producen 500 y el límite tiene tope", async () => {
    for (const body of [{}, { page: 1, limit: 10, filters: { campoRaro: "x" } }, { page: 1, limit: 10, filters: { typeId: "abc", name: "x" } }, { page: 0, limit: -4 }]) {
      expect((await api().post(`${P}/datatable`).set("Authorization", s.admin.auth).send(body)).status).toBeLessThan(500);
    }
    const huge = expectOk(await api().post(`${P}/datatable`).set("Authorization", s.admin.auth).send({ page: 1, limit: 99999999, filters: {} }));
    expect(huge.rows.length).toBeLessThanOrEqual(1000);
  });
});

describe("ocupación", () => {
  const occ = (id: number) => `${P}/${id}/occupancy`;

  it("camino feliz: vacía → rentada (con inquilino) → vacía, con historial y periodos cerrados", async () => {
    const { vacantId, tenantPersonId, ownerPersonId } = flows.properties;
    const rented = expectOk(await api().post(occ(vacantId)).set("Authorization", s.admin.auth).send({ status: "RENTED", tenantPersonId, ownerPersonId, notes: "Contrato anual" }), 201);
    expect(rented).toMatchObject({ status: "RENTED" });
    expect(rented.period).toMatchObject({ tenantPersonId, ownerPersonId, createdById: s.admin.id });

    const state = expectOk(await api().get(occ(vacantId)).set("Authorization", s.shift.auth));
    expect(state).toMatchObject({ status: { code: "RENTED" }, overcrowded: false });
    expect(state.history).toHaveLength(2);
    expect(state.current.tenant.id).toBe(tenantPersonId);

    expectOk(await api().post(occ(vacantId)).set("Authorization", s.admin.auth).send({ status: "VACANT" }), 201);
    const after = expectOk(await api().get(occ(vacantId)).set("Authorization", s.admin.auth));
    expect(after.history).toHaveLength(3);
    expect(after.history.filter((p: any) => p.endDate === null)).toHaveLength(1);
  });

  it("rentada sin inquilino → 400; transición no permitida → 409; estado inexistente → 400", async () => {
    expectFail(await api().post(occ(flows.properties.vacantId)).set("Authorization", s.admin.auth).send({ status: "RENTED" }), 400, "OCCUPANCY_TENANT_REQUIRED");
    expectFail(await api().post(occ(flows.properties.vacantId)).set("Authorization", s.admin.auth).send({ status: "VACANT" }), 409, "INVALID_TRANSITION");
    expectFail(await api().post(occ(flows.properties.vacantId)).set("Authorization", s.admin.auth).send({ status: "EN_RUINAS" }), 400, "OCCUPANCY_STATUS_INVALID");
    expect((await prisma.property.findUniqueOrThrow({ where: { id: flows.properties.vacantId }, include: { occupancyStatus: true } })).occupancyStatus.code).toBe("VACANT");
  });

  it("dejar una propiedad con residentes exige confirmar su baja; al confirmar se cierran vínculos y cuentas", async () => {
    const { houseId } = flows.properties;
    expectFail(await api().post(occ(houseId)).set("Authorization", s.admin.auth).send({ status: "VACANT" }), 409, "OCCUPANCY_HAS_RESIDENTS");
    expect((await prisma.property.findUniqueOrThrow({ where: { id: houseId } })).residentCount).toBe(1);
    expectOk(await api().post(occ(houseId)).set("Authorization", s.admin.auth).send({ status: "VACANT", releaseResidents: true }), 201);
    expect((await prisma.property.findUniqueOrThrow({ where: { id: houseId } })).residentCount).toBe(0);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: s.resident.id } })).active).toBe(false);
    expect(await prisma.resident.count({ where: { propertyId: houseId, status: "ACTIVE" } })).toBe(0);
  });

  it.each([
    ["sin estado", {}],
    ["estado vacío", { status: " " }],
    ["inquilino no numérico", { status: "RENTED", tenantPersonId: "abc" }],
    ["notas enormes", { status: "RENTED", notes: "x".repeat(501) }],
  ])("valida la entrada: %s → 400", async (_n, body) => {
    expectFail(await api().post(occ(flows.properties.vacantId)).set("Authorization", s.admin.auth).send(body), 400, "VALIDATION_ERROR");
  });

  it("propiedad inexistente o eliminada → 404; inquilino inexistente → 4xx", async () => {
    expectFail(await api().get(occ(MISSING_ID)).set("Authorization", s.admin.auth), 404, "PROPERTY_NOT_FOUND");
    expectFail(await api().post(occ(MISSING_ID)).set("Authorization", s.admin.auth).send({ status: "RENTED", tenantPersonId: 1 }), 404, "PROPERTY_NOT_FOUND");
    const ghost = await api().post(occ(flows.properties.vacantId)).set("Authorization", s.admin.auth).send({ status: "RENTED", tenantPersonId: MISSING_ID });
    expect(ghost.status).toBeGreaterThanOrEqual(400);
    expect(ghost.status).toBeLessThan(500);
    expect((await prisma.occupancyPeriod.count({ where: { propertyId: flows.properties.vacantId, endDate: null } }))).toBe(1);
  });

  it("cambiar la ocupación solo lo hace ADMIN; consultarla ADMIN/SHIFT", async () => {
    for (const key of ["shift", "guard1", "maint", "resident"]) {
      expectFail(await api().post(occ(flows.properties.vacantId)).set("Authorization", s[key].auth).send({ status: "FOR_RENT" }), 403);
    }
    for (const key of ["guard1", "maint", "resident"]) expectFail(await api().get(occ(flows.properties.vacantId)).set("Authorization", s[key].auth), 403);
  });
});

describe("cambio de propietario", () => {
  const own = (id: number) => `${P}/${id}/ownership`;

  it("camino feliz: queda el historial con el propietario anterior y el nuevo", async () => {
    const { houseId, ownerPersonId, tenantPersonId } = flows.properties;
    const change = expectOk(await api().post(own(houseId)).set("Authorization", s.admin.auth).send({ toPersonId: String(tenantPersonId), notes: "Compraventa" }), 201);
    expect(change).toMatchObject({ fromPersonId: ownerPersonId, toPersonId: tenantPersonId, changedById: s.admin.id });
    expect((await prisma.property.findUniqueOrThrow({ where: { id: houseId } })).ownerPersonId).toBe(tenantPersonId);
  });

  it("valida: sin destinatario, no numérico, propiedad o persona inexistente; solo ADMIN", async () => {
    expectFail(await api().post(own(flows.properties.houseId)).set("Authorization", s.admin.auth).send({}), 400, "VALIDATION_ERROR");
    expectFail(await api().post(own(flows.properties.houseId)).set("Authorization", s.admin.auth).send({ toPersonId: "x" }), 400, "VALIDATION_ERROR");
    expectFail(await api().post(own(MISSING_ID)).set("Authorization", s.admin.auth).send({ toPersonId: flows.properties.tenantPersonId }), 404, "PROPERTY_NOT_FOUND");
    const ghost = await api().post(own(flows.properties.houseId)).set("Authorization", s.admin.auth).send({ toPersonId: MISSING_ID });
    expect(ghost.status).toBeGreaterThanOrEqual(400);
    expect(ghost.status).toBeLessThan(500);
    expectFail(await api().post(own(flows.properties.houseId)).set("Authorization", s.shift.auth).send({ toPersonId: flows.properties.tenantPersonId }), 403);
    expect(await prisma.ownershipChange.count()).toBe(0);
  });
});

describe("importación masiva", () => {
  const IMP = `${P}/import`;
  const row = (over: Record<string, unknown> = {}) => ({ identifier: "IMP-1", name: "Importada 1", mainStreet: "Calle CSV 1", kind: "HOUSE", occupancy: "VACANT", ...over });

  it("crea las filas válidas y reporta las inválidas sin abortar el lote", async () => {
    const res = expectOk(
      await api().post(IMP).set("Authorization", s.admin.auth).send({
        rows: [
          row(),
          row({ identifier: "IMP-2", kind: "APARTMENT", floor: "3", unitNumber: "301" }),
          row({ identifier: "IMP-3", kind: "CASTILLO" }),
          row({ identifier: "IMP-4", occupancy: "ENCANTADA" }),
          row({ identifier: "" }),
          row({ identifier: "FLUJO-CASA-01" }),
          "no es un objeto",
        ],
      }),
    );
    expect(res.created).toBe(2);
    expect(res.errors.map((e: any) => e.row)).toEqual([3, 4, 5, 6, 7]);
    expect(res.errors.find((e: any) => e.row === 6).messages).toEqual(["identifier: ya existe"]);
    expect(await prisma.occupancyPeriod.count({ where: { propertyId: { in: res.createdIds } } })).toBe(2);
    expect((await prisma.property.findFirstOrThrow({ where: { identifier: "IMP-2" } })).floor).toBe(3);
  });

  it("lote vacío, sin filas, demasiado grande o mal formado → 400; solo ADMIN", async () => {
    expectFail(await api().post(IMP).set("Authorization", s.admin.auth).send({ rows: [] }), 400, "IMPORT_EMPTY");
    expectFail(await api().post(IMP).set("Authorization", s.admin.auth).send({}), 400, "VALIDATION_ERROR");
    expectFail(await api().post(IMP).set("Authorization", s.admin.auth).send({ rows: "csv" }), 400, "VALIDATION_ERROR");
    expectFail(await api().post(IMP).set("Authorization", s.admin.auth).send({ rows: Array.from({ length: 501 }, (_, i) => row({ identifier: `X${i}` })) }), 400, "VALIDATION_ERROR");
    expectFail(await api().post(IMP).set("Authorization", s.shift.auth).send({ rows: [row()] }), 403);
    expectFail(await api().post(IMP).set("Authorization", s.resident.auth).send({ rows: [row()] }), 403);
  });
});
