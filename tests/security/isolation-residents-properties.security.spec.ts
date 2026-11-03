/**
 * Multicliente, fase 2 · residentes y propiedades (con personas, quejas y mantenimiento):
 * el cliente A no ve ni toca datos del cliente B.
 *
 * Organización COMPANY con dos clientes: el administrador elige con X-Client-Id; el residente de cada
 * cliente solo ve lo suyo (su propiedad, sus quejas y su kardex).
 */
import request from "supertest";
import { app } from "@src/app";
import { resetDatabase, disconnectDatabase, prisma } from "../setup/db";
import { buildOrganization, buildUser, tokenFor } from "../factories";

const V1 = "/api/v1";

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await disconnectDatabase();
});

const bearer = (user: Parameters<typeof tokenFor>[0]) => ({ Authorization: `Bearer ${tokenFor(user)}` });

/** Catálogos legados + nuevos que exige el alta de propiedades creadas directo con Prisma. */
const propertyCatalogs = async () => {
  const kind = await prisma.propertyKind.findUniqueOrThrow({ where: { code: "HOUSE" } });
  const vacant = await prisma.occupancyStatus.findUniqueOrThrow({ where: { code: "VACANT" } });
  const type = await prisma.propertyType.findUniqueOrThrow({ where: { name: "CASA" } });
  const status = await prisma.propertyStatus.findUniqueOrThrow({ where: { name: "VACNT" } });
  return { kind, vacant, type, status };
};

const setup = async () => {
  const { organization, clients } = await buildOrganization("COMPANY", 2);
  const [a, b] = clients;
  const admin = await buildUser("ADMIN", { scope: { organizationId: organization.id, clientId: null } });
  const guardA = await buildUser("GUARD", { scope: { organizationId: organization.id, clientId: a.id } });
  const guardB = await buildUser("GUARD", { scope: { organizationId: organization.id, clientId: b.id } });
  // Guardia de la organización sin asignación activa: no tiene cliente.
  const guardNoClient = await buildUser("GUARD", { scope: { organizationId: organization.id, clientId: null } });

  const { kind, vacant, type, status } = await propertyCatalogs();
  const propertyA = await prisma.property.create({
    data: { clientId: a.id, identifier: "SEC-A", name: "Casa Secreta A", mainStreet: "Calle A", typeId: type.id, statusId: status.id, kindId: kind.id, occupancyStatusId: vacant.id },
  });
  const propertyB = await prisma.property.create({
    data: { clientId: b.id, identifier: "SEC-B", name: "Casa Secreta B", mainStreet: "Calle B", typeId: type.id, statusId: status.id, kindId: kind.id, occupancyStatusId: vacant.id },
  });
  await prisma.occupancyPeriod.create({ data: { propertyId: propertyA.id, statusId: vacant.id, startDate: new Date() } });
  await prisma.occupancyPeriod.create({ data: { propertyId: propertyB.id, statusId: vacant.id, startDate: new Date() } });

  /** Residente con cuenta RESDN, propiedad de su cliente y vínculo activo (owner y vínculo legado). */
  const makeResident = async (clientId: number, propertyId: number, firstName: string) => {
    const user = await buildUser("RESDN", { scope: { organizationId: organization.id, clientId: null }, name: firstName, username: `res_${firstName.toLowerCase()}` });
    await prisma.user.update({ where: { id: user.id }, data: { propertyId } });
    const person = await prisma.person.create({ data: { clientId, firstName, userId: user.id } });
    const owner = await prisma.residentKind.findUniqueOrThrow({ where: { code: "OWNER" } });
    const link = await prisma.resident.create({ data: { personId: person.id, propertyId, kindId: owner.id, isPrimary: true, startDate: new Date() } });
    return { user, person, link, auth: `Bearer ${tokenFor(user)}` };
  };
  const residentA = await makeResident(a.id, propertyA.id, "SoloA");
  const residentB = await makeResident(b.id, propertyB.id, "SoloB");

  /** Administrador de organización que elige cliente con X-Client-Id. */
  const asAdmin = (clientId: number) => ({ ...bearer(admin), "X-Client-Id": String(clientId) });

  const makeComplaint = async (auth: string) => {
    const res = await request(app)
      .post(`${V1}/complaints`)
      .set("Authorization", auth)
      .send({ category: "RUIDO", title: `Queja de ${auth === residentA.auth ? "A" : "B"}`, description: "Detalle de la queja de prueba" });
    return res;
  };

  return {
    organization,
    a,
    b,
    admin,
    guardA,
    guardB,
    guardNoClient,
    propertyA,
    propertyB,
    residentA,
    residentB,
    makeComplaint,
    asAdmin,
    propertyBody: { typeId: type.id, statusId: status.id },
  };
};

describe("propiedades · aislamiento por cliente", () => {
  it("listado, datatable (incluida la búsqueda SQL) y detalle solo del cliente elegido", async () => {
    const { a, b, propertyA, propertyB, asAdmin } = await setup();

    expect((await request(app).get(`${V1}/properties`).set(asAdmin(a.id))).body.data.map((p: any) => p.id)).toEqual([propertyA.id]);
    expect((await request(app).get(`${V1}/properties`).set(asAdmin(b.id))).body.data.map((p: any) => p.id)).toEqual([propertyB.id]);

    const tableA = await request(app).post(`${V1}/properties/datatable`).set(asAdmin(a.id)).send({ page: 1, limit: 10, filters: { name: "secreta" } });
    expect(tableA.body.data.rows.map((p: any) => p.id)).toEqual([propertyA.id]);
    expect(tableA.body.data.total).toBe(1);

    const tableB = await request(app).post(`${V1}/properties/datatable`).set(asAdmin(b.id)).send({ page: 1, limit: 10, filters: { name: "secreta" } });
    expect(tableB.body.data.rows.map((p: any) => p.id)).toEqual([propertyB.id]);

    // Estadísticas de ocupación: solo el cliente elegido.
    const stats = await request(app).get(`${V1}/properties/stats/occupancy`).set(asAdmin(a.id));
    expect(stats.body.data).toMatchObject({ properties: 1 });

    expect((await request(app).get(`${V1}/properties/${propertyA.id}`).set(asAdmin(a.id))).status).toBe(200);
    expect((await request(app).get(`${V1}/properties/${propertyB.id}`).set(asAdmin(a.id))).status).toBe(404);
  });

  it("desde A no se edita ni se borra una propiedad de B (404) y queda intacta", async () => {
    const { a, b, propertyB, asAdmin } = await setup();

    expect((await request(app).put(`${V1}/properties/${propertyB.id}`).set(asAdmin(a.id)).send({ name: "Tomada" })).status).toBe(404);
    expect((await request(app).delete(`${V1}/properties/${propertyB.id}`).set(asAdmin(a.id))).status).toBe(404);
    expect(await prisma.property.findUniqueOrThrow({ where: { id: propertyB.id } })).toMatchObject({ name: "Casa Secreta B", softDelete: false });

    expect((await request(app).put(`${V1}/properties/${propertyB.id}`).set(asAdmin(b.id)).send({ name: "Renombrada B" })).status).toBe(200);
  });

  it("una propiedad nueva queda en el cliente elegido", async () => {
    const { b, asAdmin, propertyBody } = await setup();
    const res = await request(app)
      .post(`${V1}/properties`)
      .set(asAdmin(b.id))
      .send({ ...propertyBody, identifier: "NUEVA-B", name: "Nueva B", mainStreet: "Calle B" });
    expect(res.status).toBe(201);
    expect((await prisma.property.findUniqueOrThrow({ where: { id: res.body.data.id } })).clientId).toBe(b.id);
  });

  it("importación: las propiedades importadas quedan en el cliente elegido", async () => {
    const { b, asAdmin } = await setup();
    const res = await request(app)
      .post(`${V1}/properties/import`)
      .set(asAdmin(b.id))
      .send({ rows: [{ identifier: "CSV-B", name: "Casa CSV B", mainStreet: "Calle", kind: "HOUSE", occupancy: "VACANT" }] });
    expect(res.body.data.created).toBe(1);
    expect((await prisma.property.findFirstOrThrow({ where: { identifier: "CSV-B" } })).clientId).toBe(b.id);
  });

  it("ocupación: consultar o cambiar la de B desde A es 404; desde B funciona", async () => {
    const { a, b, propertyA, propertyB, asAdmin } = await setup();

    expect((await request(app).get(`${V1}/properties/${propertyB.id}/occupancy`).set(asAdmin(a.id))).status).toBe(404);
    expect((await request(app).post(`${V1}/properties/${propertyB.id}/occupancy`).set(asAdmin(a.id)).send({ status: "OWNER_OCCUPIED" })).status).toBe(404);

    expect((await request(app).get(`${V1}/properties/${propertyA.id}/occupancy`).set(asAdmin(a.id))).status).toBe(200);
    expect((await request(app).post(`${V1}/properties/${propertyA.id}/occupancy`).set(asAdmin(b.id)).send({ status: "OWNER_OCCUPIED" })).status).toBe(404);
    expect((await request(app).post(`${V1}/properties/${propertyA.id}/occupancy`).set(asAdmin(a.id)).send({ status: "OWNER_OCCUPIED" })).status).toBe(201);
  });

  it("escrituras con referencias de otro cliente: propiedad ajena en el alta y persona ajena como inquilino/propietario → error sin guardar", async () => {
    const { a, propertyA, propertyB, residentB, asAdmin, propertyBody } = await setup();

    // Propiedad de B en el alcance de A: 404 en el hogar; 400 al referenciar su propiedad en un alta de residente.
    expect((await request(app).get(`${V1}/properties/${propertyB.id}/residents`).set(asAdmin(a.id))).status).toBe(404);

    // Persona de B en el hogar de A → 400 (referencia ajena).
    const household = await request(app)
      .post(`${V1}/properties/${propertyA.id}/residents`)
      .set(asAdmin(a.id))
      .send({ personId: residentB.person.id, kindCode: "FAMILY" });
    expect(household.status).toBe(400);
    expect(await prisma.resident.count({ where: { propertyId: propertyA.id, personId: residentB.person.id } })).toBe(0);

    // Persona de B como inquilino de una propiedad de A → 400.
    const occupancy = await request(app)
      .post(`${V1}/properties/${propertyA.id}/occupancy`)
      .set(asAdmin(a.id))
      .send({ status: "RENTED", tenantPersonId: residentB.person.id });
    expect(occupancy.status).toBe(400);

    // Persona de B como nuevo propietario de una propiedad de A → 400.
    expect(
      (await request(app).post(`${V1}/properties/${propertyA.id}/ownership`).set(asAdmin(a.id)).send({ toPersonId: residentB.person.id })).status,
    ).toBe(400);

    // Propiedad de B en el alta de un residente por la ruta anterior → 400 (no se crea la cuenta).
    const before = await prisma.user.count();
    const created = await request(app)
      .post(`${V1}/residents`)
      .set(asAdmin(a.id))
      .send({ name: "Nuevo", lastName: "Residente", username: "nuevo_a", password: "clave-nueva-1", propertyId: propertyB.id });
    expect(created.status).toBe(400);
    expect(await prisma.user.count()).toBe(before);

    // Alta válida: queda en el cliente A y en la organización de quien la da de alta.
    const ok = await request(app)
      .post(`${V1}/residents`)
      .set(asAdmin(a.id))
      .send({ name: "Nuevo", lastName: "Residente", username: "nuevo_a", password: "clave-nueva-1", propertyId: propertyA.id });
    expect(ok.status).toBe(201);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: ok.body.data.id } });
    expect(user).toMatchObject({ propertyId: propertyA.id, organizationId: (await prisma.client.findUniqueOrThrow({ where: { id: a.id } })).organizationId });
  });
});

describe("residentes · aislamiento por cliente", () => {
  it("listado, datatable (SQL crudo) y detalle solo del cliente elegido", async () => {
    const { a, b, residentA, residentB, asAdmin } = await setup();

    const listA = await request(app).get(`${V1}/residents`).set(asAdmin(a.id));
    expect(listA.body.data.map((u: any) => u.id)).toEqual([residentA.user.id]);
    const listB = await request(app).get(`${V1}/residents`).set(asAdmin(b.id));
    expect(listB.body.data.map((u: any) => u.id)).toEqual([residentB.user.id]);

    const tableA = await request(app).post(`${V1}/residents/datatable`).set(asAdmin(a.id)).send({ page: 1, limit: 10, filters: { search: "solo" } });
    expect(tableA.body.data.rows.map((u: any) => u.id)).toEqual([residentA.user.id]);
    expect(tableA.body.data.total).toBe(1);
    const tableB = await request(app).post(`${V1}/residents/datatable`).set(asAdmin(b.id)).send({ page: 1, limit: 10, filters: { search: "solo" } });
    expect(tableB.body.data.rows.map((u: any) => u.id)).toEqual([residentB.user.id]);

    // Filtro por la propiedad de B desde A: vacío (no revela datos).
    const foreignProperty = await request(app).post(`${V1}/residents/datatable`).set(asAdmin(a.id)).send({ page: 1, limit: 10, filters: { propertyId: (await prisma.user.findUniqueOrThrow({ where: { id: residentB.user.id } })).propertyId } });
    expect(foreignProperty.body.data).toMatchObject({ rows: [], total: 0 });

    expect((await request(app).get(`${V1}/residents/${residentB.user.id}`).set(asAdmin(a.id))).status).toBe(404);
    expect((await request(app).get(`${V1}/residents/${residentA.user.id}`).set(asAdmin(a.id))).status).toBe(200);
  });

  it("desde A no se edita ni se borra un residente de B (404) y el expediente financiero ajeno es 404", async () => {
    const { a, b, residentB, asAdmin } = await setup();

    expect((await request(app).put(`${V1}/residents/${residentB.user.id}`).set(asAdmin(a.id)).send({ name: "Tomado" })).status).toBe(404);
    expect((await request(app).delete(`${V1}/residents/${residentB.user.id}`).set(asAdmin(a.id))).status).toBe(404);
    expect((await request(app).get(`${V1}/residents/${residentB.user.id}/finance`).set(asAdmin(a.id))).status).toBe(404);
    expect((await request(app).get(`${V1}/residents/${residentB.user.id}/contacts`).set(asAdmin(a.id))).status).toBe(404);
    expect(await prisma.user.findUniqueOrThrow({ where: { id: residentB.user.id } })).toMatchObject({ softDelete: false, name: "SoloB" });

    // El mismo residente, desde su cliente, sí se consulta.
    expect((await request(app).get(`${V1}/residents/${residentB.user.id}`).set(asAdmin(b.id))).status).toBe(200);
  });

  it("mover a un residente de A a una casa de B por la ruta anterior → 400 sin cambiarlo", async () => {
    const { a, residentA, asAdmin } = await setup();
    const propertyB = await prisma.property.findFirstOrThrow({ where: { identifier: "SEC-B" } });

    expect((await request(app).put(`${V1}/residents/${residentA.user.id}`).set(asAdmin(a.id)).send({ propertyId: propertyB.id })).status).toBe(400);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: residentA.user.id } })).propertyId).not.toBe(propertyB.id);
  });

  it("el residente de A solo ve lo suyo: su registro, su hogar y su kardex; nunca lo de B", async () => {
    const { a, propertyA, propertyB, residentA, residentB, asAdmin } = await setup();

    expect((await request(app).get(`${V1}/residents/${residentA.user.id}`).set("Authorization", residentA.auth)).status).toBe(200);
    expect((await request(app).get(`${V1}/residents/${residentB.user.id}`).set("Authorization", residentA.auth)).status).toBe(403);
    expect((await request(app).get(`${V1}/residents/${residentB.user.id}/contacts`).set("Authorization", residentA.auth)).status).toBe(403);

    const kardexA = await request(app).get(`${V1}/residents/me/kardex`).set("Authorization", residentA.auth);
    expect(kardexA.status).toBe(200);
    expect(kardexA.body.data.propertyId).toBe(propertyA.id);
    const kardexB = await request(app).get(`${V1}/residents/me/kardex`).set("Authorization", residentB.auth);
    expect(kardexB.body.data.propertyId).toBe(propertyB.id);

    // El hogar de la casa de B no se consulta desde A (404).
    expect((await request(app).get(`${V1}/properties/${propertyB.id}/residents`).set(asAdmin(a.id))).status).toBe(404);
    expect((await request(app).get(`${V1}/properties/${propertyA.id}/residents`).set(asAdmin(a.id))).status).toBe(200);
  });
});

describe("personas, quejas y mantenimiento · aislamiento por cliente", () => {
  it("la búsqueda de personas y sus documentos/contactos no cruzan de cliente", async () => {
    const { a, b, residentA, residentB, asAdmin } = await setup();

    const foundA = await request(app).get(`${V1}/persons?q=Solo`).set(asAdmin(a.id));
    expect(foundA.body.data.map((p: any) => p.id)).toEqual([residentA.person.id]);
    const foundB = await request(app).get(`${V1}/persons?q=Solo`).set(asAdmin(b.id));
    expect(foundB.body.data.map((p: any) => p.id)).toEqual([residentB.person.id]);

    expect((await request(app).get(`${V1}/persons/${residentB.person.id}/contacts`).set(asAdmin(a.id))).status).toBe(404);
    expect((await request(app).post(`${V1}/persons/${residentB.person.id}/contacts`).set(asAdmin(a.id)).send({ name: "Intruso" })).status).toBe(404);
    expect((await request(app).get(`${V1}/persons/${residentB.person.id}/documents`).set(asAdmin(a.id))).status).toBe(404);
    expect((await request(app).post(`${V1}/persons/${residentB.person.id}/account`).set(asAdmin(a.id)).send({ username: "hack_b", password: "clave-hack-1" })).status).toBe(404);
    expect((await request(app).get(`${V1}/persons/${residentA.person.id}/contacts`).set(asAdmin(a.id))).status).toBe(200);
  });

  it("quejas: el personal solo ve las de su cliente; una queja de B no se lee, escribe ni cambia desde A (404)", async () => {
    const { a, b, residentA, residentB, asAdmin, makeComplaint } = await setup();

    const complaintA = await makeComplaint(residentA.auth);
    expect(complaintA.status).toBe(201);
    // La queja nace en la propiedad del residente (cliente A).
    expect((await prisma.complaint.findUniqueOrThrow({ where: { id: complaintA.body.data.id } })).propertyId).toBe(residentA.link.propertyId);
    expect((await makeComplaint(residentB.auth)).status).toBe(201);

    const listA = await request(app).get(`${V1}/complaints`).set(asAdmin(a.id));
    expect(listA.body.data.items.map((c: any) => c.id)).toEqual([complaintA.body.data.id]);
    const listB = await request(app).get(`${V1}/complaints`).set(asAdmin(b.id));
    expect(listB.body.data.items).toHaveLength(1);
    expect(listB.body.data.items[0].id).not.toBe(complaintA.body.data.id);

    const complaintB = listB.body.data.items[0].id;
    expect((await request(app).get(`${V1}/complaints/${complaintB}`).set(asAdmin(a.id))).status).toBe(404);
    expect((await request(app).post(`${V1}/complaints/${complaintB}/messages`).set(asAdmin(a.id)).send({ body: "Hola" })).status).toBe(404);
    expect((await request(app).patch(`${V1}/complaints/${complaintB}/status`).set(asAdmin(a.id)).send({ status: "IN_REVIEW" })).status).toBe(404);

    // El residente de A solo ve las suyas.
    const mine = await request(app).get(`${V1}/complaints`).set("Authorization", residentA.auth);
    expect(mine.body.data.items.map((c: any) => c.id)).toEqual([complaintA.body.data.id]);
    expect((await request(app).get(`${V1}/complaints/${complaintB}`).set("Authorization", residentA.auth)).status).toBe(404);
    expect((await request(app).post(`${V1}/complaints/${complaintB}/messages`).set("Authorization", residentA.auth).send({ body: "Hola" })).status).toBe(404);
  });

  it("mantenimiento: el reporte de un guardia de B no se ve, resuelve ni borra desde A (404)", async () => {
    const { a, b, guardA, guardB, asAdmin } = await setup();

    expect((await request(app).post(`${V1}/maintenance`).set(bearer(guardA)).send({ title: "Fuga de A" })).status).toBe(201);
    expect((await request(app).post(`${V1}/maintenance`).set(bearer(guardB)).send({ title: "Fuga de B" })).status).toBe(201);
    const maintenanceA = await prisma.maintenance.findFirstOrThrow({ where: { title: "Fuga de A" } });
    const maintenanceB = await prisma.maintenance.findFirstOrThrow({ where: { title: "Fuga de B" } });

    const listA = await request(app).get(`${V1}/maintenance`).set(asAdmin(a.id));
    expect(listA.body.data.map((m: any) => m.id)).toEqual([maintenanceA.id]);
    const listB = await request(app).get(`${V1}/maintenance`).set(asAdmin(b.id));
    expect(listB.body.data.map((m: any) => m.id)).toEqual([maintenanceB.id]);

    const tableA = await request(app).post(`${V1}/maintenance/datatable`).set(asAdmin(a.id)).send({ page: 1, limit: 10 });
    expect(tableA.body.data.rows.map((m: any) => m.id)).toEqual([maintenanceA.id]);

    expect((await request(app).put(`${V1}/maintenance/${maintenanceB.id}/resolve`).set(asAdmin(a.id))).status).toBe(404);
    expect((await request(app).delete(`${V1}/maintenance/${maintenanceB.id}`).set(asAdmin(a.id))).status).toBe(404);
    expect(await prisma.maintenance.findUniqueOrThrow({ where: { id: maintenanceB.id } })).toMatchObject({ status: "PENDING" });

    expect((await request(app).put(`${V1}/maintenance/${maintenanceA.id}/resolve`).set(asAdmin(a.id))).status).toBe(200);
  });
});

describe("sin cliente en el alcance · 403", () => {
  it("administrador de una organización con varios clientes sin X-Client-Id no ve datos de ningún cliente", async () => {
    const { admin } = await setup();
    const auth = bearer(admin);

    for (const [method, path] of [
      ["get", "/properties"],
      ["post", "/properties/datatable"],
      ["get", "/properties/stats/occupancy"],
      ["get", "/residents"],
      ["post", "/residents/datatable"],
      ["get", "/complaints"],
      ["get", "/maintenance"],
      ["get", "/persons?q="],
    ] as const) {
      const res = await (request(app) as any)[method](`${V1}${path}`).set(method === "post" ? auth : auth).send(method === "post" ? { page: 1, limit: 10 } : undefined);
      expect(res.status).toBe(403);
    }
  });

  it("guardia sin asignación activa y residente sin propiedad no acceden a datos de cliente", async () => {
    const { organization, guardNoClient } = await setup();
    const guardAuth = bearer(guardNoClient);

    expect((await request(app).post(`${V1}/residents/datatable`).set(guardAuth).send({ page: 1, limit: 10 })).status).toBe(403);
    expect((await request(app).post(`${V1}/properties/datatable`).set(guardAuth).send({ page: 1, limit: 10 })).status).toBe(403);
    expect((await request(app).get(`${V1}/maintenance`).set(guardAuth)).status).toBe(403);

    const residentNoProperty = await buildUser("RESDN", { scope: { organizationId: organization.id, clientId: null } });
    const residentAuth = bearer(residentNoProperty);
    expect((await request(app).get(`${V1}/complaints`).set(residentAuth)).status).toBe(403);
    const kardex = await request(app).get(`${V1}/residents/me/kardex`).set(residentAuth);
    expect(kardex.status).toBe(403);
    expect(kardex.body.code).toBe("NO_ACTIVE_RESIDENCE");
  });
});
