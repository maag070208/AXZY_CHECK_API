/**
 * Fase 3 · rol CLIENT: administrador del cliente (residencial, plaza o maquila).
 * Su alcance es fijo al cliente al que pertenece: no elige con X-Client-Id y no ve la administración de la
 * organización (clientes, plantilla de guardias, usuarios).
 */
import request from "supertest";
import { app } from "@src/app";
import { resetDatabase, disconnectDatabase, prisma } from "../setup/db";
import { buildOrganization, buildUser, defaultClient, tokenFor } from "../factories";

const V1 = "/api/v1";

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await disconnectDatabase();
});

const bearer = (user: Parameters<typeof tokenFor>[0]) => ({ Authorization: `Bearer ${tokenFor(user)}` });

const makeProperty = async (identifier: string, clientId: number) => {
  const kind = await prisma.propertyKind.findUniqueOrThrow({ where: { code: "HOUSE" } });
  const vacant = await prisma.occupancyStatus.findUniqueOrThrow({ where: { code: "VACANT" } });
  const type = await prisma.propertyType.findUniqueOrThrow({ where: { name: "CASA" } });
  const status = await prisma.propertyStatus.findUniqueOrThrow({ where: { name: "VACNT" } });
  return prisma.property.create({
    data: { identifier, name: identifier, mainStreet: "Calle", typeId: type.id, statusId: status.id, kindId: kind.id, occupancyStatusId: vacant.id, clientId },
  });
};

const setup = async () => {
  const { organization, clients } = await buildOrganization("COMPANY", 2);
  const [a, b] = clients;
  const clientA = await buildUser("CLIENT", { scope: { organizationId: organization.id, clientId: a.id } });
  const clientB = await buildUser("CLIENT", { scope: { organizationId: organization.id, clientId: b.id } });
  const admin = await buildUser("ADMIN", { scope: { organizationId: organization.id, clientId: null } });
  const guardA = await buildUser("GUARD", { scope: { organizationId: organization.id, clientId: a.id } });

  const propertyA = await makeProperty("CL-A", a.id);
  const propertyB = await makeProperty("CL-B", b.id);
  const residentA = await prisma.user.create({
    data: { name: "Resi", lastName: "A", username: "resi_a", password: "x", roleId: (await prisma.role.findUniqueOrThrow({ where: { name: "RESDN" } })).id, organizationId: organization.id, propertyId: propertyA.id },
  });
  const residentB = await prisma.user.create({
    data: { name: "Resi", lastName: "B", username: "resi_b", password: "x", roleId: (await prisma.role.findUniqueOrThrow({ where: { name: "RESDN" } })).id, organizationId: organization.id, propertyId: propertyB.id },
  });

  const incidentA = await prisma.incident.create({ data: { clientId: a.id, guardId: guardA.id, title: "Incidencia A", kind: "INCIDENT", status: "PENDING" } });
  const incidentB = await prisma.incident.create({ data: { clientId: b.id, guardId: guardA.id, title: "Incidencia B", kind: "INCIDENT", status: "PENDING" } });
  const announcementA = await prisma.announcement.create({ data: { clientId: a.id, title: "Aviso A", body: "Solo A", audience: "ALL", createdById: admin.id } });
  const announcementB = await prisma.announcement.create({ data: { clientId: b.id, title: "Aviso B", body: "Solo B", audience: "ALL", createdById: admin.id } });

  return { organization, a, b, clientA, clientB, admin, guardA, propertyA, propertyB, residentA, residentB, incidentA, incidentB, announcementA, announcementB };
};

describe("rol CLIENT · alcance fijo a su cliente", () => {
  it("ve solo los datos de su cliente (incidencias, avisos, residentes, propiedades)", async () => {
    const { a, clientA, residentA, incidentA, incidentB, announcementA } = await setup();

    expect((await request(app).get(`${V1}/incidents`).set(bearer(clientA))).body.data.map((i: any) => i.id)).toEqual([incidentA.id]);
    expect((await request(app).get(`${V1}/announcements`).set(bearer(clientA))).body.data.items.map((x: any) => x.id)).toEqual([announcementA.id]);
    expect((await request(app).post(`${V1}/residents/datatable`).set(bearer(clientA)).send({ page: 1, limit: 10 })).body.data.rows.map((r: any) => r.id)).toContain(residentA.id);
    const properties = await request(app).get(`${V1}/properties`).set(bearer(clientA));
    expect(properties.status).toBe(200);

    // El detalle de un dato de otro cliente es "no encontrado".
    expect((await request(app).get(`${V1}/incidents/${incidentB.id}`).set(bearer(clientA))).status).toBe(404);
  });

  it("no puede elegir otro cliente con X-Client-Id (403)", async () => {
    const { b, clientA } = await setup();
    expect((await request(app).get(`${V1}/incidents`).set({ ...bearer(clientA), "X-Client-Id": String(b.id) })).status).toBe(403);
  });

  it("sus altas quedan en su cliente", async () => {
    const { a, clientA } = await setup();
    const incident = await request(app).post(`${V1}/incidents`).set(bearer(clientA)).send({ title: "Reporte del cliente" });
    expect(incident.status).toBe(201);
    expect((await prisma.incident.findUniqueOrThrow({ where: { id: incident.body.data.id } })).clientId).toBe(a.id);

    const announcement = await request(app)
      .post(`${V1}/announcements`)
      .set(bearer(clientA))
      .send({ title: "Aviso del cliente", body: "Solo su cliente", audience: "ALL" });
    expect(announcement.status).toBe(201);
    expect((await prisma.announcement.findUniqueOrThrow({ where: { id: announcement.body.data.id } })).clientId).toBe(a.id);
  });

  it("no accede a la administración de la organización (clientes, asignaciones, usuarios)", async () => {
    const { clientA, b } = await setup();
    expect((await request(app).get(`${V1}/clients`).set(bearer(clientA))).status).toBe(403);
    expect((await request(app).post(`${V1}/clients`).set(bearer(clientA)).send({ name: "Nuevo", type: "PLAZA" })).status).toBe(403);
    expect((await request(app).get(`${V1}/guard-assignments`).set(bearer(clientA))).status).toBe(403);
    expect((await request(app).post(`${V1}/guard-assignments`).set(bearer(clientA)).send({ guardId: 1, clientId: b.id })).status).toBe(403);
    expect((await request(app).get(`${V1}/users`).set(bearer(clientA))).status).toBe(403);
  });

  it("un CLIENT sin cliente asignado no ve datos (403)", async () => {
    const { organization } = await buildOrganization("COMPANY", 1);
    const orphan = await buildUser("CLIENT", { scope: { organizationId: organization.id, clientId: null } });
    expect((await request(app).get(`${V1}/incidents`).set(bearer(orphan))).status).toBe(403);
    expect((await request(app).get(`${V1}/announcements`).set(bearer(orphan))).status).toBe(403);
  });
});

describe("rol CLIENT · creado por el ADMIN", () => {
  it("el administrador crea un CLIENT para el cliente elegido con X-Client-Id", async () => {
    const { a, admin } = await setup();
    const created = await request(app)
      .post(`${V1}/users`)
      .set({ ...bearer(admin), "X-Client-Id": String(a.id) })
      .send({ name: "Cliente", lastName: "Admin", username: "cliente.admin", password: "ClaveSegura123!", role: "CLIENT" });
    expect(created.status).toBe(201);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: created.body.data.id } })).clientId).toBe(a.id);

    // Sin cliente elegido no se puede crear un administrador de cliente.
    const withoutClient = await request(app)
      .post(`${V1}/users`)
      .set(bearer(admin))
      .send({ name: "Otro", lastName: "Cliente", username: "cliente.admin2", password: "ClaveSegura123!", role: "CLIENT" });
    expect(withoutClient.status).toBe(400);
  });

  it("la organización por defecto de producto 1 tiene el rol CLIENT sembrado", async () => {
    const { clientId } = await defaultClient();
    const client = await buildUser("CLIENT", { scope: { organizationId: (await defaultClient()).organizationId, clientId } });
    const res = await request(app).get(`${V1}/incidents`).set(bearer(client));
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });
});
