/**
 * Flujo: residentes (cuentas de la APP), contactos, hogar (titular y mudanza), personas,
 * documentos privados y cuentas de residente.
 */
import { api, allSessions, bootFlows, disconnectDatabase, expectFail, expectOk, loginReal, MISSING_ID, prisma, Session, V1 } from "./support";
import { FlowsResult } from "../../prisma/seeds/flows";

let flows: FlowsResult;
let s: Record<string, Session>;

beforeEach(async () => {
  flows = await bootFlows();
  s = await allSessions();
});
afterAll(disconnectDatabase);

const R = `${V1}/residents`;
const newResident = (over: Record<string, unknown> = {}) => ({
  name: "Vera", lastName: "Vecina", username: "vera_vecina", password: "clave-vecina-1", propertyId: flows.properties.vacantId,
  firstName: "Vera", fatherLastName: "Vecina", phoneNumber: "5550110000", email: "vera@example.test", ...over,
});

describe("residentes (cuentas)", () => {
  it("camino feliz: crear → leer → listar → datatable → editar → baja", async () => {
    const created = expectOk(await api().post(R).set("Authorization", s.admin.auth).send(newResident()), 201);
    expect(created).toMatchObject({ username: "vera_vecina", propertyId: flows.properties.vacantId, residentProfile: { phoneNumber: "5550110000" } });
    expect(JSON.stringify(created)).not.toMatch(/clave-vecina|password/);

    const role = await prisma.user.findUniqueOrThrow({ where: { id: created.id }, include: { role: true } });
    expect(role.role.name).toBe("RESDN");
    expect((await loginReal("vera_vecina", "clave-vecina-1")).status).toBe(200);
    // La cuenta queda reflejada como residente activa de su propiedad.
    expect(await prisma.resident.count({ where: { propertyId: flows.properties.vacantId, status: "ACTIVE" } })).toBe(1);

    expect(expectOk(await api().get(`${R}/${created.id}`).set("Authorization", s.guard1.auth))).toMatchObject({ id: created.id });
    expect(expectOk(await api().get(R).set("Authorization", s.shift.auth)).map((u: any) => u.username)).toEqual(["flow_resident", "vera_vecina"].sort());

    const table = expectOk(await api().post(`${R}/datatable`).set("Authorization", s.admin.auth).send({ page: 1, limit: 10, filters: { search: "VERA" } }));
    expect(table.rows.map((r: any) => r.username)).toEqual(["vera_vecina"]);
    expect(JSON.stringify(table)).not.toMatch(/\$2[aby]\$/);
    const byProperty = expectOk(await api().post(`${R}/datatable`).set("Authorization", s.admin.auth).send({ page: 1, limit: 10, filters: { search: "ve", propertyId: flows.properties.vacantId } }));
    expect(byProperty.total).toBe(1);

    expectOk(await api().put(`${R}/${created.id}`).set("Authorization", s.admin.auth).send({ name: "Vera María", phoneNumber: "5550111000", password: "otra-clave-22" }));
    expect((await loginReal("vera_vecina", "otra-clave-22")).status).toBe(200);
    expect((await prisma.residentProfile.findUniqueOrThrow({ where: { userId: created.id } })).phoneNumber).toBe("5550111000");

    expectOk(await api().delete(`${R}/${created.id}`).set("Authorization", s.admin.auth));
    expect(await prisma.user.findUniqueOrThrow({ where: { id: created.id } })).toMatchObject({ softDelete: true, active: false, propertyId: null });
    expect(await prisma.resident.count({ where: { propertyId: flows.properties.vacantId, status: "ACTIVE" } })).toBe(0);
    expectFail(await loginReal("vera_vecina", "otra-clave-22"), 401);
    expectFail(await api().get(`${R}/${created.id}`).set("Authorization", s.admin.auth), 404);
  });

  it.each([
    ["sin nombre", { name: undefined }],
    ["sin usuario", { username: undefined }],
    ["contraseña corta", { password: "123" }],
    ["correo inválido", { email: "no-es-correo" }],
    ["propiedad no numérica", { propertyId: "casa" }],
    ["teléfono largo", { phoneNumber: "9".repeat(31) }],
  ])("valida la entrada al crear: %s → 400", async (_n, over) => {
    const before = await prisma.user.count();
    expectFail(await api().post(R).set("Authorization", s.admin.auth).send(newResident(over)), 400, "VALIDATION_ERROR");
    expect(await prisma.user.count()).toBe(before);
  });

  it("usuario repetido → 400; propiedad inexistente → 4xx sin dejar el usuario a medias", async () => {
    expectFail(await api().post(R).set("Authorization", s.admin.auth).send(newResident({ username: "flow_resident" })), 400);
    const before = await prisma.user.count();
    const ghost = await api().post(R).set("Authorization", s.admin.auth).send(newResident({ propertyId: MISSING_ID }));
    expect(ghost.status).toBeGreaterThanOrEqual(400);
    expect(ghost.status).toBeLessThan(500);
    expect(await prisma.user.count()).toBe(before);
  });

  it("leer/editar/borrar un residente inexistente → 404; id no numérico → 400", async () => {
    expectFail(await api().get(`${R}/${MISSING_ID}`).set("Authorization", s.admin.auth), 404);
    expectFail(await api().put(`${R}/${MISSING_ID}`).set("Authorization", s.admin.auth).send({ name: "Xx" }), 404);
    expectFail(await api().delete(`${R}/${MISSING_ID}`).set("Authorization", s.admin.auth), 404);
    expectFail(await api().put(`${R}/abc`).set("Authorization", s.admin.auth).send({ name: "Xx" }), 400, "VALIDATION_ERROR");
    const bad = await api().get(`${R}/abc`).set("Authorization", s.admin.auth);
    expect(bad.status).toBeGreaterThanOrEqual(400);
    expect(bad.status).toBeLessThan(500);
  });

  it("el módulo de residentes no sirve para leer, editar ni borrar cuentas de otros roles → 404", async () => {
    expectFail(await api().get(`${R}/${s.admin.id}`).set("Authorization", s.admin.auth), 404);
    expectFail(await api().put(`${R}/${s.guard1.id}`).set("Authorization", s.admin.auth).send({ name: "Hack", password: "clave-hack-1" }), 404);
    expectFail(await api().delete(`${R}/${s.guard1.id}`).set("Authorization", s.admin.auth), 404);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: s.guard1.id } })).softDelete).toBe(false);
  });

  it("editar un residente no le cambia el rol aunque se mande roleId", async () => {
    const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: "ADMIN" } });
    expectOk(await api().put(`${R}/${s.resident.id}`).set("Authorization", s.admin.auth).send({ name: "Rosa", roleId: adminRole.id, role: "ADMIN" }));
    expect((await prisma.user.findUniqueOrThrow({ where: { id: s.resident.id }, include: { role: true } })).role.name).toBe("RESDN");
  });

  it("gestión solo ADMIN: SHIFT, GUARD, MAINT y residentes → 403", async () => {
    for (const key of ["shift", "guard1", "maint", "resident"]) {
      expectFail(await api().post(R).set("Authorization", s[key].auth).send(newResident()), 403);
      expectFail(await api().put(`${R}/${s.resident.id}`).set("Authorization", s[key].auth).send({ name: "Xx" }), 403);
      expectFail(await api().delete(`${R}/${s.resident.id}`).set("Authorization", s[key].auth), 403);
    }
  });

  it("privacidad: un residente solo ve SU registro y SUS contactos, no los de sus vecinos; el personal sí", async () => {
    const neighbor = expectOk(await api().post(R).set("Authorization", s.admin.auth).send(newResident()), 201);
    expectOk(await api().get(`${R}/${s.resident.id}`).set("Authorization", s.resident.auth));
    expectOk(await api().get(`${R}/${s.resident.id}/contacts`).set("Authorization", s.resident.auth));
    expectFail(await api().get(`${R}/${neighbor.id}`).set("Authorization", s.resident.auth), 403);
    expectFail(await api().get(`${R}/${neighbor.id}/contacts`).set("Authorization", s.resident.auth), 403);
    expectFail(await api().get(R).set("Authorization", s.resident.auth), 403);
    expectFail(await api().post(`${R}/datatable`).set("Authorization", s.resident.auth).send({}), 403);
    expectOk(await api().get(`${R}/${neighbor.id}`).set("Authorization", s.guard1.auth));
    expectFail(await api().get(R), 401);
  });

  it("catálogos: parentescos y tipos de residente", async () => {
    expect(expectOk(await api().get(`${R}/catalog/relationships`).set("Authorization", s.resident.auth)).data ?? true).toBeTruthy();
    const kinds = expectOk(await api().get(`${R}/kinds`).set("Authorization", s.shift.auth));
    expect(kinds.map((k: any) => k.code)).toEqual(expect.arrayContaining(["OWNER", "TENANT", "FAMILY", "DOMESTIC"]));
    expectFail(await api().get(`${R}/kinds`).set("Authorization", s.guard1.auth), 403);
  });
});

describe("contactos del residente", () => {
  const contacts = (id: number) => `${R}/${id}/contacts`;

  it("camino feliz: crear → listar → editar → baja lógica", async () => {
    const created = await api().post(contacts(s.resident.id)).set("Authorization", s.admin.auth).send({ name: "Mario Madre", phone: "5550120000", email: "madre@example.test", relationship: "Madre" });
    expect(created.status).toBe(201);
    const id = created.body.data.id;
    const list = await api().get(contacts(s.resident.id)).set("Authorization", s.resident.auth);
    expect(list.status).toBe(200);
    expect(list.body.data.map((c: any) => c.id)).toContain(id);
    expect((await api().put(`${R}/contacts/${id}`).set("Authorization", s.admin.auth).send({ phone: "5550121000" })).status).toBe(200);
    expect((await prisma.residentContact.findUniqueOrThrow({ where: { id } })).phone).toBe("5550121000");
    expect((await api().delete(`${R}/contacts/${id}`).set("Authorization", s.admin.auth)).status).toBe(200);
    expect((await api().get(contacts(s.resident.id)).set("Authorization", s.resident.auth)).body.data).toEqual([]);
    expect((await prisma.residentContact.findUniqueOrThrow({ where: { id } })).active).toBe(false);
  });

  it.each([
    ["sin nombre", { phone: "1" }],
    ["correo inválido", { name: "X", email: "no" }],
    ["nombre largo", { name: "x".repeat(121) }],
  ])("valida la entrada: %s → 400", async (_n, body) => {
    expectFail(await api().post(contacts(s.resident.id)).set("Authorization", s.admin.auth).send(body), 400, "VALIDATION_ERROR");
  });

  it("residente o contacto inexistente → 4xx; solo ADMIN escribe", async () => {
    const ghostUser = await api().post(contacts(MISSING_ID)).set("Authorization", s.admin.auth).send({ name: "Fantasma" });
    expect(ghostUser.status).toBeGreaterThanOrEqual(400);
    expect(ghostUser.status).toBeLessThan(500);
    const ghostContact = await api().put(`${R}/contacts/${MISSING_ID}`).set("Authorization", s.admin.auth).send({ name: "Xx" });
    expect(ghostContact.status).toBe(404);
    expect((await api().delete(`${R}/contacts/${MISSING_ID}`).set("Authorization", s.admin.auth)).status).toBe(404);
    for (const key of ["shift", "guard1", "maint"]) {
      expectFail(await api().post(contacts(s.resident.id)).set("Authorization", s[key].auth).send({ name: "Xx" }), 403);
    }
    // El residente sí puede administrar sus propios contactos (selfOrPermission).
    expect((await api().post(contacts(s.resident.id)).set("Authorization", s.resident.auth).send({ name: "Contacto Propio" })).status).toBe(201);
  });
});

describe("hogar de una propiedad", () => {
  const H = (id: number) => `${V1}/properties/${id}/residents`;

  it("camino feliz: agregar personas, el primero es titular, cambiar titular, mudanza con relevo", async () => {
    const { vacantId } = flows.properties;
    const rented = flows.properties.apartmentId;
    const first = expectOk(await api().post(H(rented)).set("Authorization", s.admin.auth).send({ firstName: "Inés", lastName: "Inquilina", phone: "5550131", kindCode: "TENANT" }), 201);
    expect(first).toMatchObject({ isPrimary: true, status: "ACTIVE", kind: { code: "TENANT" } });
    const second = expectOk(await api().post(H(rented)).set("Authorization", s.admin.auth).send({ firstName: "Iván", lastName: "Hijo", phone: "5550132", kindCode: "FAMILY" }), 201);
    expect(second.isPrimary).toBe(false);
    // El personal doméstico no suma al conteo del hogar.
    expectOk(await api().post(H(rented)).set("Authorization", s.admin.auth).send({ firstName: "Dana", lastName: "Doméstica", phone: "5550133", kindCode: "DOMESTIC" }), 201);
    expect((await prisma.property.findUniqueOrThrow({ where: { id: rented } })).residentCount).toBe(2);

    const household = expectOk(await api().get(H(rented)).set("Authorization", s.shift.auth));
    expect(household.map((r: any) => r.kind.code)).toEqual(["TENANT", "FAMILY", "DOMESTIC"]);
    expect(household[0].isPrimary).toBe(true);

    expect(expectOk(await api().post(`${R}/${second.id}/primary`).set("Authorization", s.admin.auth)).isPrimary).toBe(true);
    expect((await prisma.resident.findUniqueOrThrow({ where: { id: first.id } })).isPrimary).toBe(false);

    const moved = expectOk(await api().post(`${R}/${second.id}/move-out`).set("Authorization", s.admin.auth).send({ replacementPrimaryId: first.id }));
    expect(moved).toMatchObject({ residentId: second.id, warning: null });
    expect((await prisma.resident.findUniqueOrThrow({ where: { id: first.id } })).isPrimary).toBe(true);
    expect((await prisma.property.findUniqueOrThrow({ where: { id: rented } })).residentCount).toBe(1);
    expect(vacantId).toBeGreaterThan(0);
  });

  it("mudanza del titular sin relevo advierte PROPERTY_WITHOUT_PRIMARY y conserva el historial", async () => {
    const moved = expectOk(await api().post(`${R}/${flows.properties.primaryResidentId}/move-out`).set("Authorization", s.admin.auth).send({}));
    expect(moved.warning).toBe("PROPERTY_WITHOUT_PRIMARY");
    expect(await prisma.resident.count({ where: { id: flows.properties.primaryResidentId, status: "MOVED_OUT" } })).toBe(1);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: s.resident.id } })).propertyId).toBeNull();
    expectFail(await api().post(`${R}/${flows.properties.primaryResidentId}/move-out`).set("Authorization", s.admin.auth).send({}), 409, "RESIDENT_NOT_ACTIVE");
    expectFail(await api().post(`${R}/${flows.properties.primaryResidentId}/primary`).set("Authorization", s.admin.auth), 409, "RESIDENT_NOT_ACTIVE");
  });

  it("reglas: persona duplicada → 409 hasta confirmar; ya vinculada → 409; tipo inválido → 400; relevo inválido → 400", async () => {
    const { apartmentId } = flows.properties;
    const body = { firstName: "Tania", lastName: "Inquilina", phone: "5550101", kindCode: "TENANT" };
    expectFail(await api().post(H(apartmentId)).set("Authorization", s.admin.auth).send(body), 409, "DUPLICATE_PERSON");
    const confirmed = expectOk(await api().post(H(apartmentId)).set("Authorization", s.admin.auth).send({ ...body, confirmNewPerson: true }), 201);
    expect(confirmed.person.id).not.toBe(flows.properties.tenantPersonId);

    const link = { personId: flows.properties.tenantPersonId, kindCode: "TENANT" };
    expectOk(await api().post(H(apartmentId)).set("Authorization", s.admin.auth).send(link), 201);
    expectFail(await api().post(H(apartmentId)).set("Authorization", s.admin.auth).send(link), 409, "RESIDENT_ALREADY_LINKED");
    expectFail(await api().post(H(apartmentId)).set("Authorization", s.admin.auth).send({ firstName: "Ana", kindCode: "REY" }), 400, "RESIDENT_KIND_INVALID");
    expectFail(await api().post(H(apartmentId)).set("Authorization", s.admin.auth).send({ personId: MISSING_ID, kindCode: "TENANT" }), 404, "PERSON_NOT_FOUND");
    expectFail(await api().post(H(MISSING_ID)).set("Authorization", s.admin.auth).send({ firstName: "Ana", kindCode: "OWNER" }), 404, "PROPERTY_NOT_FOUND");

    expectFail(await api().post(`${R}/${flows.properties.primaryResidentId}/move-out`).set("Authorization", s.admin.auth).send({ replacementPrimaryId: MISSING_ID }), 400, "REPLACEMENT_INVALID");
  });

  it("menores de edad no tienen cuenta de APP; solo un miembro del hogar puede ser titular", async () => {
    const { apartmentId } = flows.properties;
    const year = new Date().getUTCFullYear() - 10;
    expectFail(await api().post(H(apartmentId)).set("Authorization", s.admin.auth).send({ firstName: "Pablo", lastName: "Pequeño", birthDate: `${year}-05-05`, kindCode: "FAMILY", hasAppAccess: true }), 400, "RESIDENT_MINOR_NO_ACCOUNT");
    const domestic = expectOk(await api().post(H(apartmentId)).set("Authorization", s.admin.auth).send({ firstName: "Dalia", lastName: "Servicio", kindCode: "DOMESTIC" }), 201);
    expectFail(await api().post(`${R}/${domestic.id}/primary`).set("Authorization", s.admin.auth), 400, "RESIDENT_NOT_HOUSEHOLD");
  });

  it.each([
    ["sin persona ni nombre", { kindCode: "OWNER" }],
    ["sin tipo", { firstName: "Ana" }],
    ["correo inválido", { firstName: "Ana", kindCode: "OWNER", email: "no" }],
    ["tipos incorrectos", { firstName: 5, kindCode: [] }],
  ])("valida la entrada: %s → 400", async (_n, body) => {
    expectFail(await api().post(H(flows.properties.vacantId)).set("Authorization", s.admin.auth).send(body), 400, "VALIDATION_ERROR");
  });

  it("consulta ADMIN/SHIFT; alta, titular y mudanza solo ADMIN", async () => {
    for (const key of ["guard1", "maint", "resident"]) expectFail(await api().get(H(flows.properties.houseId)).set("Authorization", s[key].auth), 403);
    for (const key of ["shift", "guard1", "maint", "resident"]) {
      expectFail(await api().post(H(flows.properties.vacantId)).set("Authorization", s[key].auth).send({ firstName: "X", kindCode: "OWNER" }), 403);
      expectFail(await api().post(`${R}/${flows.properties.primaryResidentId}/primary`).set("Authorization", s[key].auth), 403);
      expectFail(await api().post(`${R}/${flows.properties.primaryResidentId}/move-out`).set("Authorization", s[key].auth).send({}), 403);
    }
  });
});

describe("personas, documentos y cuentas", () => {
  const PE = `${V1}/persons`;

  const confirmedPrivateFile = async (isPrivate = true, status: "CONFIRMED" | "PENDING" = "CONFIRMED") =>
    prisma.mediaFile.create({ data: { key: `media/${Math.random()}.jpg`, contentType: "image/jpeg", sizeBytes: 1000, status, isPrivate, uploadedById: s.admin.id } });

  it("búsqueda y alta de personas con aviso de duplicados", async () => {
    const found = expectOk(await api().get(`${PE}?q=oscar`).set("Authorization", s.admin.auth));
    expect(found.map((p: any) => p.id)).toEqual([flows.properties.ownerPersonId]);
    expect(expectOk(await api().get(`${PE}?q=5550102`).set("Authorization", s.admin.auth)).map((p: any) => p.firstName)).toEqual(["Rosa"]);
    expectFail(await api().get(`${PE}?q=${"x".repeat(81)}`).set("Authorization", s.admin.auth), 400, "VALIDATION_ERROR");

    const created = expectOk(await api().post(PE).set("Authorization", s.admin.auth).send({ firstName: "Nora", lastName: "Nueva", phone: "5550140", email: "nora@example.test" }), 201);
    expect(created).toMatchObject({ firstName: "Nora" });
    const dup = await api().post(PE).set("Authorization", s.admin.auth).send({ firstName: "Nora", lastName: "Nueva", phone: "5550140" });
    expectFail(dup, 409, "DUPLICATE_PERSON");
    expect(dup.body.candidates.map((c: any) => c.id)).toEqual([created.id]);
    expectOk(await api().post(PE).set("Authorization", s.admin.auth).send({ firstName: "Nora", lastName: "Nueva", phone: "5550140", confirmNewPerson: true }), 201);
    expectFail(await api().post(PE).set("Authorization", s.admin.auth).send({ lastName: "SinNombre" }), 400, "VALIDATION_ERROR");
    expectFail(await api().post(PE).set("Authorization", s.admin.auth).send({ firstName: "X", email: "no" }), 400, "VALIDATION_ERROR");
  });

  it("contactos de una persona", async () => {
    const created = expectOk(await api().post(`${PE}/${flows.properties.ownerPersonId}/contacts`).set("Authorization", s.admin.auth).send({ name: "Camila Contacto", phone: "5550150", relationship: "Hermano(a)" }), 201);
    expect(expectOk(await api().get(`${PE}/${flows.properties.ownerPersonId}/contacts`).set("Authorization", s.admin.auth)).map((c: any) => c.id)).toEqual([created.id]);
    expectFail(await api().post(`${PE}/${flows.properties.ownerPersonId}/contacts`).set("Authorization", s.admin.auth).send({ phone: "1" }), 400, "VALIDATION_ERROR");
    const ghost = await api().post(`${PE}/${MISSING_ID}/contacts`).set("Authorization", s.admin.auth).send({ name: "X" });
    expect(ghost.status).toBeGreaterThanOrEqual(400);
    expect(ghost.status).toBeLessThan(500);
    for (const key of ["shift", "guard1", "maint", "resident"]) expectFail(await api().get(`${PE}/${flows.properties.ownerPersonId}/contacts`).set("Authorization", s[key].auth), 403);
  });

  it("documentos: subir, listar (solo ADMIN), por vencer, y sus reglas", async () => {
    const owner = flows.properties.ownerPersonId;
    const file = await confirmedPrivateFile();
    const doc = expectOk(await api().post(`${PE}/${owner}/documents`).set("Authorization", s.admin.auth).send({ kindCode: "INE", mediaFileId: file.id, expiresAt: "2999-01-01" }), 201);
    expect(doc.kind.code).toBe("INE");
    const list = expectOk(await api().get(`${PE}/${owner}/documents`).set("Authorization", s.admin.auth));
    expect(list).toHaveLength(1);
    expect(JSON.stringify(list)).not.toMatch(/mediaFile|key|url/);
    const soon = await confirmedPrivateFile();
    expectOk(await api().post(`${PE}/${owner}/documents`).set("Authorization", s.admin.auth).send({ kindCode: "CONTRACT", mediaFileId: soon.id, expiresAt: new Date(Date.now() + 5 * 86400_000).toISOString().slice(0, 10) }), 201);
    expect(expectOk(await api().get(`${PE}/documents/expiring?days=30`).set("Authorization", s.admin.auth))).toHaveLength(1);
    expectFail(await api().get(`${PE}/documents/expiring?days=0`).set("Authorization", s.admin.auth), 400, "VALIDATION_ERROR");

    expectFail(await api().post(`${PE}/${owner}/documents`).set("Authorization", s.admin.auth).send({ kindCode: "INE", mediaFileId: (await confirmedPrivateFile()).id }), 400, "DOCUMENT_EXPIRY_REQUIRED");
    expectFail(await api().post(`${PE}/${owner}/documents`).set("Authorization", s.admin.auth).send({ kindCode: "OTHER", mediaFileId: (await confirmedPrivateFile(true, "PENDING")).id }), 409, "MEDIA_NOT_CONFIRMED");
    expectFail(await api().post(`${PE}/${owner}/documents`).set("Authorization", s.admin.auth).send({ kindCode: "OTHER", mediaFileId: (await confirmedPrivateFile(false)).id }), 400, "DOCUMENT_FILE_NOT_PRIVATE");
    expectFail(await api().post(`${PE}/${owner}/documents`).set("Authorization", s.admin.auth).send({ kindCode: "NADA", mediaFileId: file.id }), 400, "DOCUMENT_KIND_INVALID");
    expectFail(await api().post(`${PE}/${MISSING_ID}/documents`).set("Authorization", s.admin.auth).send({ kindCode: "OTHER", mediaFileId: file.id }), 404, "PERSON_NOT_FOUND");
    expectFail(await api().post(`${PE}/${owner}/documents`).set("Authorization", s.admin.auth).send({ kindCode: "OTHER" }), 400, "VALIDATION_ERROR");

    // Solo ADMIN ve documentos; subirlos es de residents.manage (ADMIN); nunca otros roles.
    for (const key of ["shift", "guard1", "maint", "resident"]) {
      expectFail(await api().get(`${PE}/${owner}/documents`).set("Authorization", s[key].auth), 403);
      expectFail(await api().get(`${PE}/documents/expiring`).set("Authorization", s[key].auth), 403);
      expectFail(await api().post(`${PE}/${owner}/documents`).set("Authorization", s[key].auth).send({ kindCode: "OTHER", mediaFileId: file.id }), 403);
    }
  });

  it("los menores no tienen documentos", async () => {
    const kid = await prisma.person.create({ data: { firstName: "Mini", birthDate: new Date(Date.UTC(new Date().getUTCFullYear() - 8, 1, 1)) } });
    const file = await confirmedPrivateFile();
    expectFail(await api().post(`${PE}/${kid.id}/documents`).set("Authorization", s.admin.auth).send({ kindCode: "OTHER", mediaFileId: file.id }), 400, "PERSON_MINOR_NO_DOCUMENTS");
  });

  it("cuenta de residente desde la persona: crea el usuario RESDN y sus reglas", async () => {
    const link = await api().post(`${V1}/properties/${flows.properties.apartmentId}/residents`).set("Authorization", s.admin.auth).send({ firstName: "Iris", lastName: "Inquilina", phone: "5550160", kindCode: "TENANT" });
    const personId = link.body.data.person.id;
    const account = expectOk(await api().post(`${PE}/${personId}/account`).set("Authorization", s.admin.auth).send({ username: "iris_inquilina", password: "clave-iris-1" }), 201);
    expect(account).toMatchObject({ username: "iris_inquilina", propertyId: flows.properties.apartmentId });
    expect(JSON.stringify(account)).not.toMatch(/password/);
    expect((await loginReal("iris_inquilina", "clave-iris-1")).status).toBe(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { username: "iris_inquilina" }, include: { role: true } })).role.name).toBe("RESDN");

    expectFail(await api().post(`${PE}/${personId}/account`).set("Authorization", s.admin.auth).send({ username: "otro_usuario", password: "clave-iris-2" }), 409, "ACCOUNT_EXISTS");
    const lone = await prisma.person.create({ data: { firstName: "Sola" } });
    expectFail(await api().post(`${PE}/${lone.id}/account`).set("Authorization", s.admin.auth).send({ username: "sola_cuenta", password: "clave-sola-1" }), 409, "RESIDENT_NOT_ACTIVE");
    expectFail(await api().post(`${PE}/${MISSING_ID}/account`).set("Authorization", s.admin.auth).send({ username: "nadie_x", password: "clave-nadie-1" }), 404, "PERSON_NOT_FOUND");
    expectFail(await api().post(`${PE}/${lone.id}/account`).set("Authorization", s.admin.auth).send({ username: "ab", password: "123" }), 400, "VALIDATION_ERROR");
    for (const key of ["shift", "guard1", "maint", "resident"]) expectFail(await api().post(`${PE}/${lone.id}/account`).set("Authorization", s[key].auth).send({ username: "hack_user", password: "clave-hack-1" }), 403);
  });

  it("el nombre de usuario de la cuenta no puede ser uno existente → 409", async () => {
    const link = await api().post(`${V1}/properties/${flows.properties.apartmentId}/residents`).set("Authorization", s.admin.auth).send({ firstName: "Ivo", lastName: "Inquilino", phone: "5550161", kindCode: "TENANT" });
    expectFail(await api().post(`${PE}/${link.body.data.person.id}/account`).set("Authorization", s.admin.auth).send({ username: "flow_admin", password: "clave-ivo-1" }), 409, "USERNAME_TAKEN");
  });
});
