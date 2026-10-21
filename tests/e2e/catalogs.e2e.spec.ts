/**
 * Flujos: catálogos de lectura (/catalog/:key), catálogos administrables (/catalogs/*)
 * y administración de categorías/tipos de incidencia (/catalog-admin/*).
 */
import { api, allSessions, bootFlows, disconnectDatabase, expectFail, expectOk, MISSING_ID, prisma, Session, V1 } from "./support";

let s: Record<string, Session>;

beforeEach(async () => {
  await bootFlows();
  s = await allSessions();
});
afterAll(disconnectDatabase);

describe("catálogos de lectura /catalog/:key", () => {
  it.each([
    "property_type", "property_status", "invitation_type", "invitation_status", "resident_relationship",
    "role", "property", "guard", "incident_category", "incident_type", "club_category", "club_type",
  ])("%s responde una lista con id, name y value", async (key) => {
    const rows = expectOk(await api().get(`${V1}/catalog/${key}`).set("Authorization", s.guard1.auth));
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) expect(row).toEqual(expect.objectContaining({ id: expect.any(Number), name: expect.any(String), value: expect.any(String) }));
  });

  it("el catálogo de guardias solo trae guardias activos y arma el nombre sin 'null'", async () => {
    await prisma.user.update({ where: { id: s.guard2.id }, data: { lastName: null } });
    const inactive = await prisma.user.create({ data: { name: "Baja", username: "guardia_baja", password: "x", active: false, roleId: (await prisma.role.findUniqueOrThrow({ where: { name: "GUARD" } })).id } });
    const rows = expectOk(await api().get(`${V1}/catalog/guard`).set("Authorization", s.admin.auth));
    expect(rows.map((r: any) => r.id)).not.toContain(inactive.id);
    expect(rows.find((r: any) => r.id === s.guard2.id).value).toBe("Gonzalo");
    expect(JSON.stringify(rows)).not.toContain("null");
  });

  it("el catálogo de categorías de club solo trae las de club, y las incidencias solo las activas", async () => {
    const club = expectOk(await api().get(`${V1}/catalog/club_category`).set("Authorization", s.guard1.auth));
    expect(club.every((c: any) => c.type === "CASA_CLUB")).toBe(true);
    await prisma.incidentCategory.update({ where: { name: "SERVICIOS" }, data: { active: false } });
    const inc = expectOk(await api().get(`${V1}/catalog/incident_category`).set("Authorization", s.guard1.auth));
    expect(inc.map((c: any) => c.name)).not.toContain("SERVICIOS");
  });

  it("clave desconocida → 404 con código; sin token → 401", async () => {
    expectFail(await api().get(`${V1}/catalog/no_existe`).set("Authorization", s.admin.auth), 404, "CATALOG_NOT_FOUND");
    expectFail(await api().get(`${V1}/catalog/role`), 401);
  });
});

describe("catálogos administrables /catalogs/*", () => {
  const P = `${V1}/catalogs/property-types`;
  const T = `${V1}/catalogs/incident-types`;

  it("lista los catálogos disponibles", async () => {
    const list = expectOk(await api().get(`${V1}/catalogs`).set("Authorization", s.guard1.auth));
    expect(list.map((c: any) => c.key)).toEqual(expect.arrayContaining(["property-types", "incident-types", "resident-relationships"]));
  });

  it("camino feliz: crear → listar → editar → reordenar → desactivar → borrar, con bitácora", async () => {
    const created = expectOk(await api().post(P).set("Authorization", s.admin.auth).send({ name: "LOCAL", value: "Local comercial", order: 9 }), 201);
    expect(created).toMatchObject({ name: "LOCAL", isSystem: false, active: true });
    expect(expectOk(await api().get(P).set("Authorization", s.resident.auth)).map((r: any) => r.name)).toContain("LOCAL");
    expectOk(await api().put(`${P}/${created.id}`).set("Authorization", s.admin.auth).send({ value: "Local" }));
    const all = expectOk(await api().get(`${P}?all=true`).set("Authorization", s.admin.auth));
    expectOk(await api().put(`${P}/reorder`).set("Authorization", s.admin.auth).send({ ids: all.map((r: any) => r.id).reverse() }));
    expect((await prisma.propertyType.findUniqueOrThrow({ where: { id: created.id } })).order).toBe(0);

    const first = expectOk(await api().delete(`${P}/${created.id}`).set("Authorization", s.admin.auth));
    expect(first).toMatchObject({ deactivated: true, active: false });
    expect(expectOk(await api().get(P).set("Authorization", s.admin.auth)).map((r: any) => r.name)).not.toContain("LOCAL");
    expect(expectOk(await api().delete(`${P}/${created.id}`).set("Authorization", s.admin.auth))).toEqual({ id: created.id, deleted: true });
    expect(await prisma.propertyType.findUnique({ where: { id: created.id } })).toBeNull();
    const actions = (await prisma.auditLog.findMany({ where: { entity: "property-types" }, orderBy: { id: "asc" } })).map((a) => a.action);
    expect(actions).toEqual(["property-types.create", "property-types.update", "property-types.reorder", "property-types.deactivate", "property-types.delete"]);
  });

  it.each([
    ["código en minúsculas", { name: "local", value: "Local" }],
    ["código con espacios", { name: "LOCAL COMERCIAL", value: "Local" }],
    ["código de una letra", { name: "L", value: "Local" }],
    ["sin etiqueta", { name: "LOCAL" }],
    ["orden negativo", { name: "LOCAL", value: "Local", order: -1 }],
    ["tipos incorrectos", { name: 5, value: [] }],
  ])("valida la entrada: %s → 400", async (_n, body) => {
    expectFail(await api().post(P).set("Authorization", s.admin.auth).send(body), 400, "VALIDATION_ERROR");
  });

  it("código repetido → 409; renombrar un valor del sistema → 409; borrar uno del sistema → 409", async () => {
    expectFail(await api().post(P).set("Authorization", s.admin.auth).send({ name: "CASA", value: "Otra casa" }), 409, "CATALOG_CONFLICT");
    const casa = await prisma.propertyType.findUniqueOrThrow({ where: { name: "CASA" } });
    expectFail(await api().put(`${P}/${casa.id}`).set("Authorization", s.admin.auth).send({ name: "CASITA" }), 409, "CATALOG_CONFLICT");
    expectFail(await api().delete(`${P}/${casa.id}`).set("Authorization", s.admin.auth), 409, "CATALOG_CONFLICT");
    expectOk(await api().put(`${P}/${casa.id}`).set("Authorization", s.admin.auth).send({ value: "Casa habitación" }));
  });

  it("editar/borrar un id inexistente → 404; id no numérico → 400", async () => {
    expectFail(await api().put(`${P}/${MISSING_ID}`).set("Authorization", s.admin.auth).send({ value: "X" }), 404);
    expectFail(await api().delete(`${P}/${MISSING_ID}`).set("Authorization", s.admin.auth), 404);
    expectFail(await api().put(`${P}/abc`).set("Authorization", s.admin.auth).send({ value: "X" }), 400, "VALIDATION_ERROR");
  });

  it("reordenar con ids inexistentes o vacío responde un error, no se cuelga ni tumba el proceso", async () => {
    const missing = await api().put(`${P}/reorder`).set("Authorization", s.admin.auth).send({ ids: [MISSING_ID] });
    expect(missing.status).toBeGreaterThanOrEqual(400);
    expect(missing.status).toBeLessThan(500);
    expectFail(await api().put(`${P}/reorder`).set("Authorization", s.admin.auth).send({ ids: [] }), 400, "VALIDATION_ERROR");
  });

  it("filtro por padre con valor no numérico no se cuelga", async () => {
    const res = await api().get(`${T}?categoryId=abc`).set("Authorization", s.admin.auth);
    expect(res.status).toBeLessThan(500);
  });

  it("catálogo hijo: exige un padre existente y filtra por padre", async () => {
    const cat = await prisma.incidentCategory.findUniqueOrThrow({ where: { name: "SEGURIDAD" } });
    expectFail(await api().post(T).set("Authorization", s.admin.auth).send({ name: "NUEVO_TIPO", value: "Nuevo" }), 400, "VALIDATION_ERROR");
    expectFail(await api().post(T).set("Authorization", s.admin.auth).send({ name: "NUEVO_TIPO", value: "Nuevo", categoryId: MISSING_ID }), 400);
    expectOk(await api().post(T).set("Authorization", s.admin.auth).send({ name: "NUEVO_TIPO", value: "Nuevo", categoryId: cat.id }), 201);
    const filtered = expectOk(await api().get(`${T}?categoryId=${cat.id}`).set("Authorization", s.admin.auth));
    expect(filtered.every((t: any) => t.categoryId === cat.id)).toBe(true);
    expect(filtered.map((t: any) => t.name)).toContain("NUEVO_TIPO");
  });

  it("un valor en uso no se puede borrar → 409", async () => {
    const type = await prisma.propertyType.create({ data: { name: "EN_USO", value: "En uso", isSystem: false, active: false } });
    await prisma.property.updateMany({ data: { typeId: type.id } });
    expectFail(await api().delete(`${P}/${type.id}`).set("Authorization", s.admin.auth), 409, "CATALOG_CONFLICT");
  });

  it("solo ADMIN escribe; todos los autenticados leen", async () => {
    for (const key of ["shift", "guard1", "maint", "resident"]) {
      expectFail(await api().post(P).set("Authorization", s[key].auth).send({ name: "HACK", value: "Hack" }), 403);
      expectFail(await api().put(`${P}/reorder`).set("Authorization", s[key].auth).send({ ids: [1] }), 403);
      expectOk(await api().get(P).set("Authorization", s[key].auth));
    }
    expectFail(await api().get(P), 401);
  });
});

describe("administración de categorías y tipos /catalog-admin", () => {
  const C = `${V1}/catalog-admin/categories`;
  const T = `${V1}/catalog-admin/types`;

  it("categorías, camino feliz: crear → listar por tipo → editar → fijar → reordenar → desactivar → borrar", async () => {
    const created = expectOk(await api().post(C).set("Authorization", s.admin.auth).send({ name: "RUIDO_CAT", value: "Ruido", type: "INCIDENT", color: "#fff", icon: "volume" }), 201);
    expect(created).toMatchObject({ name: "RUIDO_CAT", type: "INCIDENT", active: true });
    const list = expectOk(await api().get(`${C}?type=INCIDENT`).set("Authorization", s.admin.auth));
    expect(list.every((c: any) => c.type === "INCIDENT")).toBe(true);
    expectOk(await api().put(`${C}/${created.id}`).set("Authorization", s.admin.auth).send({ value: "Ruido nocturno" }));
    expect(expectOk(await api().put(`${C}/${created.id}/pin`).set("Authorization", s.admin.auth)).order).toBe(-1);
    const ids = list.map((c: any) => c.id);
    expectOk(await api().put(`${C}/reorder`).set("Authorization", s.admin.auth).send({ ids: [created.id, ...ids] }));
    expect(expectOk(await api().delete(`${C}/${created.id}`).set("Authorization", s.admin.auth))).toMatchObject({ softDeleted: true });
    expect(expectOk(await api().delete(`${C}/${created.id}`).set("Authorization", s.admin.auth))).toMatchObject({ hardDeleted: true });
    expect(await prisma.incidentCategory.findUnique({ where: { id: created.id } })).toBeNull();
  });

  it("categorías, errores: sin tipo, tipo inválido, duplicada, sistema, inexistente", async () => {
    expectFail(await api().post(C).set("Authorization", s.admin.auth).send({ name: "X_CAT", value: "X" }), 400);
    expectFail(await api().post(C).set("Authorization", s.admin.auth).send({ name: "X_CAT", value: "X", type: "OTRO" }), 400);
    expectFail(await api().post(C).set("Authorization", s.admin.auth).send({ name: "", value: "X", type: "INCIDENT" }), 400, "VALIDATION_ERROR");
    expectFail(await api().post(C).set("Authorization", s.admin.auth).send({ name: "SEGURIDAD", value: "Dup", type: "INCIDENT" }), 409);
    const security = await prisma.incidentCategory.findUniqueOrThrow({ where: { name: "SEGURIDAD" } });
    expectFail(await api().put(`${C}/${security.id}`).set("Authorization", s.admin.auth).send({ name: "OTRA" }), 409, "CATEGORY_SYSTEM");
    expectFail(await api().put(`${C}/${MISSING_ID}`).set("Authorization", s.admin.auth).send({ value: "X" }), 404);
    expectFail(await api().delete(`${C}/${MISSING_ID}`).set("Authorization", s.admin.auth), 404, "CATEGORY_NOT_FOUND");
    expectFail(await api().put(`${C}/${MISSING_ID}/pin`).set("Authorization", s.admin.auth), 404);
    // Desactivada y de sistema: tampoco se borra de forma definitiva.
    expectOk(await api().delete(`${C}/${security.id}`).set("Authorization", s.admin.auth));
    expectFail(await api().delete(`${C}/${security.id}`).set("Authorization", s.admin.auth), 409, "CATEGORY_SYSTEM");
  });

  it("categorías: reordenar con ids no numéricos o inexistentes → 400/404", async () => {
    expectFail(await api().put(`${C}/reorder`).set("Authorization", s.admin.auth).send({ ids: ["a"] }), 400);
    const res = await api().put(`${C}/reorder`).set("Authorization", s.admin.auth).send({ ids: [MISSING_ID] });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  it("tipos, camino feliz y errores", async () => {
    const security = await prisma.incidentCategory.findUniqueOrThrow({ where: { name: "SEGURIDAD" } });
    const created = expectOk(await api().post(T).set("Authorization", s.admin.auth).send({ name: "TIPO_NUEVO", value: "Tipo nuevo", categoryId: security.id }), 201);
    expect(expectOk(await api().get(`${T}?categoryId=${security.id}`).set("Authorization", s.admin.auth)).map((t: any) => t.id)).toContain(created.id);
    expectOk(await api().put(`${T}/${created.id}`).set("Authorization", s.admin.auth).send({ value: "Renombrado" }));
    expect(expectOk(await api().put(`${T}/${created.id}/pin`).set("Authorization", s.admin.auth)).order).toBe(-1);
    expectOk(await api().put(`${T}/reorder`).set("Authorization", s.admin.auth).send({ ids: [created.id] }));
    expect(expectOk(await api().delete(`${T}/${created.id}`).set("Authorization", s.admin.auth))).toMatchObject({ softDeleted: true });
    expect(expectOk(await api().delete(`${T}/${created.id}`).set("Authorization", s.admin.auth))).toMatchObject({ hardDeleted: true });

    expectFail(await api().post(T).set("Authorization", s.admin.auth).send({ name: "SIN_CAT", value: "x" }), 400, "VALIDATION_ERROR");
    expectFail(await api().post(T).set("Authorization", s.admin.auth).send({ name: "ROBO", value: "dup", categoryId: security.id }), 409);
    expectFail(await api().post(T).set("Authorization", s.admin.auth).send({ name: "HUERFANO", value: "x", categoryId: MISSING_ID }), 400);
    expectFail(await api().put(`${T}/${MISSING_ID}`).set("Authorization", s.admin.auth).send({ value: "X" }), 404);
    expectFail(await api().delete(`${T}/${MISSING_ID}`).set("Authorization", s.admin.auth), 404, "TYPE_NOT_FOUND");
    expectFail(await api().put(`${T}/${MISSING_ID}/pin`).set("Authorization", s.admin.auth), 404);
  });

  it("solo ADMIN: SHIFT, GUARD, MAINT y residentes → 403", async () => {
    for (const key of ["shift", "guard1", "maint", "resident"]) {
      expectFail(await api().get(C).set("Authorization", s[key].auth), 403);
      expectFail(await api().post(T).set("Authorization", s[key].auth).send({ name: "HACK", value: "x", categoryId: 1 }), 403);
    }
    expectFail(await api().get(C), 401);
  });
});
