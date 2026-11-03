/**
 * Multicliente, fase 2 · ubicaciones y rutas: el cliente A no ve ni toca datos del cliente B.
 * Una organización COMPANY con dos clientes; el administrador elige con X-Client-Id y cada guardia
 * trabaja en el cliente de su asignación.
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

const setup = async () => {
  const { organization, clients } = await buildOrganization("COMPANY", 2);
  const [a, b] = clients;
  const admin = await buildUser("ADMIN", { scope: { organizationId: organization.id, clientId: null } });
  const guardA = await buildUser("GUARD", { scope: { organizationId: organization.id, clientId: a.id } });
  const guardB = await buildUser("GUARD", { scope: { organizationId: organization.id, clientId: b.id } });
  const locationA = await prisma.location.create({ data: { clientId: a.id, aisle: "A", spot: "1", number: "1", name: "Caseta A" } });
  const locationB = await prisma.location.create({ data: { clientId: b.id, aisle: "B", spot: "1", number: "1", name: "Caseta B" } });
  const routeA = await prisma.recurringConfiguration.create({
    data: {
      clientId: a.id,
      title: "Ruta A",
      guards: { connect: [{ id: guardA.id }] },
      recurringLocations: { create: [{ locationId: locationA.id }] },
    },
  });
  const asAdmin = (clientId: number) => ({ Authorization: `Bearer ${tokenFor(admin)}`, "X-Client-Id": String(clientId) });
  return { a, b, admin, guardA, guardB, locationA, locationB, routeA, asAdmin };
};

describe("ubicaciones · aislamiento por cliente", () => {
  it("el listado y el datatable solo traen las ubicaciones del cliente elegido", async () => {
    const { a, b, asAdmin } = await setup();

    const listA = await request(app).get(`${V1}/locations`).set(asAdmin(a.id));
    expect(listA.status).toBe(200);
    expect(listA.body.data.map((l: any) => l.name)).toEqual(["Caseta A"]);

    const tableB = await request(app).post(`${V1}/locations/datatable`).set(asAdmin(b.id)).send({ page: 1, limit: 10 });
    expect(tableB.body.data.rows.map((l: any) => l.name)).toEqual(["Caseta B"]);

    // Búsqueda por texto (SQL directo con unaccent) también filtra por cliente.
    const searchB = await request(app).post(`${V1}/locations/datatable`).set(asAdmin(b.id)).send({ page: 1, limit: 10, filters: { name: "caseta" } });
    expect(searchB.body.data.rows.map((l: any) => l.name)).toEqual(["Caseta B"]);
    expect(searchB.body.data.total).toBe(1);
  });

  it("una ubicación nueva queda en el cliente elegido", async () => {
    const { b, asAdmin } = await setup();
    const res = await request(app).post(`${V1}/locations`).set(asAdmin(b.id)).send({ name: "Nueva B" });
    expect(res.status).toBe(201);
    expect((await prisma.location.findUniqueOrThrow({ where: { id: res.body.data.id } })).clientId).toBe(b.id);
  });

  it("desde el cliente B no se edita ni se borra una ubicación del cliente A (404) y queda intacta", async () => {
    const { b, locationA, asAdmin } = await setup();

    expect((await request(app).put(`${V1}/locations/${locationA.id}`).set(asAdmin(b.id)).send({ name: "Tomada" })).status).toBe(404);
    expect((await request(app).delete(`${V1}/locations/${locationA.id}`).set(asAdmin(b.id))).status).toBe(404);
    expect(await prisma.location.findUniqueOrThrow({ where: { id: locationA.id } })).toMatchObject({ name: "Caseta A", clientId: locationA.clientId });
  });

  it("el guardia de B solo ve las ubicaciones de B", async () => {
    const { guardB } = await setup();
    const res = await request(app).get(`${V1}/locations`).set("Authorization", `Bearer ${tokenFor(guardB)}`);
    expect(res.body.data.map((l: any) => l.name)).toEqual(["Caseta B"]);
  });

  it("administrador de varios clientes sin X-Client-Id: 403, no datos de todos", async () => {
    const { admin } = await setup();
    const res = await request(app).get(`${V1}/locations`).set("Authorization", `Bearer ${tokenFor(admin)}`);
    expect(res.status).toBe(403);
  });

  it("guardia sin asignación activa: 403", async () => {
    const { a } = await setup();
    const org = await prisma.client.findUniqueOrThrow({ where: { id: a.id } });
    const idle = await buildUser("GUARD", { scope: { organizationId: org.organizationId, clientId: null } });
    expect((await request(app).get(`${V1}/locations`).set("Authorization", `Bearer ${tokenFor(idle)}`)).status).toBe(403);
  });
});

describe("rutas · aislamiento por cliente", () => {
  it("el listado y el datatable solo traen las rutas del cliente elegido", async () => {
    const { a, b, asAdmin } = await setup();

    expect((await request(app).get(`${V1}/recurring`).set(asAdmin(a.id))).body.data.map((r: any) => r.title)).toEqual(["Ruta A"]);
    expect((await request(app).get(`${V1}/recurring`).set(asAdmin(b.id))).body.data).toEqual([]);
    const table = await request(app).post(`${V1}/recurring/datatable`).set(asAdmin(b.id)).send({ page: 1, limit: 10 });
    expect(table.body.data).toMatchObject({ rows: [], total: 0 });
  });

  it("no se crea una ruta en B con una ubicación de A (400)", async () => {
    const { b, locationA, asAdmin } = await setup();
    const res = await request(app).post(`${V1}/recurring`).set(asAdmin(b.id)).send({ title: "Mixta", locations: [{ locationId: locationA.id }], guardIds: [] });
    expect(res.status).toBe(400);
    expect(await prisma.recurringConfiguration.count({ where: { title: "Mixta" } })).toBe(0);
  });

  it("no se asigna a una ruta un guardia de otro cliente (400)", async () => {
    const { b, guardA, locationB, asAdmin } = await setup();
    const res = await request(app).post(`${V1}/recurring`).set(asAdmin(b.id)).send({ title: "Ruta B", locations: [{ locationId: locationB.id }], guardIds: [guardA.id] });
    expect(res.status).toBe(400);
  });

  it("una ruta nueva sin guardias indicados toma solo al personal del cliente", async () => {
    const { b, guardB, locationB, asAdmin } = await setup();
    const res = await request(app).post(`${V1}/recurring`).set(asAdmin(b.id)).send({ title: "Ruta B", locations: [{ locationId: locationB.id }] });
    expect(res.status).toBe(201);
    const created = await prisma.recurringConfiguration.findUniqueOrThrow({ where: { id: res.body.data.id }, include: { guards: true } });
    expect(created.clientId).toBe(b.id);
    expect(created.guards.map((g) => g.id)).toEqual([guardB.id]);
  });

  it("desde el cliente B no se edita, activa, asigna ni borra una ruta de A (404)", async () => {
    const { b, routeA, locationB, guardB, asAdmin } = await setup();

    expect((await request(app).put(`${V1}/recurring/${routeA.id}`).set(asAdmin(b.id)).send({ title: "Tomada", locations: [{ locationId: locationB.id }] })).status).toBe(404);
    expect((await request(app).put(`${V1}/recurring/${routeA.id}/toggle`).set(asAdmin(b.id)).send({ active: false })).status).toBe(404);
    expect((await request(app).post(`${V1}/recurring/${routeA.id}/assign`).set(asAdmin(b.id)).send({ guardIds: [guardB.id] })).status).toBe(404);
    expect((await request(app).delete(`${V1}/recurring/${routeA.id}`).set(asAdmin(b.id))).status).toBe(404);
    expect(await prisma.recurringConfiguration.findUniqueOrThrow({ where: { id: routeA.id } })).toMatchObject({ title: "Ruta A", active: true });
  });

  it("mis rutas: un guardia que pasó de A a B ya no ve la ruta de A aunque siga conectado a ella", async () => {
    const { b, guardA } = await setup();
    await prisma.guardAssignment.updateMany({ where: { guardId: guardA.id, endsAt: null }, data: { endsAt: new Date() } });
    await prisma.guardAssignment.create({ data: { guardId: guardA.id, clientId: b.id, startsAt: new Date(Date.now() + 10) } });
    await new Promise((resolve) => setTimeout(resolve, 20));

    const res = await request(app).get(`${V1}/recurring/my-list`).set("Authorization", `Bearer ${tokenFor(guardA)}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });
});
