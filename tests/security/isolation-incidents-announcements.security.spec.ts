/**
 * Multicliente, fase 2 · incidencias, casa club y avisos: el cliente A no ve ni toca datos del cliente B.
 * Una organización COMPANY con dos clientes; el administrador elige con X-Client-Id y cada guardia/residente
 * trabaja en el cliente de su asignación o de su propiedad.
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
  const admin = await buildUser("ADMIN", { scope: { organizationId: organization.id, clientId: null } });
  const guardA = await buildUser("GUARD", { scope: { organizationId: organization.id, clientId: a.id } });
  const guardB = await buildUser("GUARD", { scope: { organizationId: organization.id, clientId: b.id } });
  const propertyA = await makeProperty("IS-A", a.id);
  const propertyB = await makeProperty("IS-B", b.id);

  const residentA = await buildUser("RESDN", { scope: { organizationId: organization.id, clientId: null } });
  const residentB = await buildUser("RESDN", { scope: { organizationId: organization.id, clientId: null } });
  await prisma.user.update({ where: { id: residentA.id }, data: { propertyId: propertyA.id } });
  await prisma.user.update({ where: { id: residentB.id }, data: { propertyId: propertyB.id } });

  const media = [{ type: "IMAGE", url: "https://example.test/a.jpg", key: "a.jpg" }];
  const incidentA = await prisma.incident.create({
    data: { kind: "INCIDENT", clientId: a.id, guardId: guardA.id, title: "Incidencia A", status: "PENDING", media, clientRef: "ref-inc-a" },
  });
  const incidentB = await prisma.incident.create({
    data: { kind: "INCIDENT", clientId: b.id, guardId: guardB.id, title: "Incidencia B", status: "PENDING", media },
  });
  const clubA = await prisma.incident.create({
    data: { kind: "CASA_CLUB", clientId: a.id, guardId: guardA.id, title: "Club A", status: "PENDING", clientRef: "ref-club-a" },
  });
  const clubB = await prisma.incident.create({
    data: { kind: "CASA_CLUB", clientId: b.id, guardId: guardB.id, title: "Club B", status: "PENDING" },
  });
  const announcementA = await prisma.announcement.create({
    data: { clientId: a.id, title: "Aviso A", body: "Solo A", audience: "ALL", createdById: admin.id },
  });
  const announcementB = await prisma.announcement.create({
    data: { clientId: b.id, title: "Aviso B", body: "Solo B", audience: "ALL", createdById: admin.id },
  });

  const asAdmin = (clientId: number) => ({ ...bearer(admin), "X-Client-Id": String(clientId) });
  return {
    organization, a, b, admin, guardA, guardB, propertyA, propertyB, residentA, residentB,
    incidentA, incidentB, clubA, clubB, announcementA, announcementB, asAdmin,
  };
};

describe("incidencias · aislamiento por cliente", () => {
  it("listado, datatable, pendientes y detalle solo del cliente elegido", async () => {
    const { a, b, incidentA, incidentB, asAdmin } = await setup();

    expect((await request(app).get(`${V1}/incidents`).set(asAdmin(a.id))).body.data.map((i: any) => i.id)).toEqual([incidentA.id]);
    expect((await request(app).get(`${V1}/incidents`).set(asAdmin(b.id))).body.data.map((i: any) => i.id)).toEqual([incidentB.id]);
    expect((await request(app).post(`${V1}/incidents/datatable`).set(asAdmin(b.id)).send({ page: 1, limit: 10 })).body.data.rows.map((i: any) => i.id)).toEqual([incidentB.id]);

    // Un pendiente por cliente: el contador no suma los del otro.
    expect((await request(app).get(`${V1}/incidents/pending-count`).set(asAdmin(a.id))).body.data.count).toBe(1);
    expect((await request(app).get(`${V1}/incidents/pending-count`).set(asAdmin(b.id))).body.data.count).toBe(1);
  });

  it("desde B no se resuelve ni borra una incidencia de A (404) y el contador de B no la cuenta", async () => {
    const { b, incidentA, asAdmin } = await setup();
    expect((await request(app).put(`${V1}/incidents/${incidentA.id}/resolve`).set(asAdmin(b.id)).send({})).status).toBe(404);
    expect((await request(app).delete(`${V1}/incidents/${incidentA.id}`).set(asAdmin(b.id))).status).toBe(404);
    expect((await request(app).delete(`${V1}/incidents/${incidentA.id}/media`).query({ key: "a.jpg" }).set(asAdmin(b.id))).status).toBe(404);
    expect(await prisma.incident.findUniqueOrThrow({ where: { id: incidentA.id } })).toMatchObject({ status: "PENDING" });
  });

  it("el guardia reporta en su cliente y no puede mencionar una propiedad de otro", async () => {
    const { a, b, guardA, guardB, propertyA, propertyB } = await setup();

    const fromA = await request(app).post(`${V1}/incidents`).set(bearer(guardA)).send({ title: "Reporte A" });
    expect(fromA.status).toBe(201);
    expect((await prisma.incident.findUniqueOrThrow({ where: { id: fromA.body.data.id } })).clientId).toBe(a.id);

    const fromB = await request(app).post(`${V1}/incidents`).set(bearer(guardB)).send({ title: "Reporte B", propertyId: propertyB.id });
    expect(fromB.status).toBe(201);
    expect((await prisma.incident.findUniqueOrThrow({ where: { id: fromB.body.data.id } })).clientId).toBe(b.id);

    expect((await request(app).post(`${V1}/incidents`).set(bearer(guardB)).send({ title: "Propiedad ajena", propertyId: propertyA.id })).status).toBe(400);
  });

  it("reintento offline con la clave de una incidencia de A desde B: 409, no devuelve la de A", async () => {
    const { guardB } = await setup();
    const res = await request(app).post(`${V1}/incidents`).set(bearer(guardB)).send({ title: "Reintento", clientRef: "ref-inc-a" });
    expect(res.status).toBe(409);
    expect(JSON.stringify(res.body)).not.toContain("Incidencia A");
  });

  it("casa club: listado y contador solo del cliente elegido; borrar de A desde B es 404", async () => {
    const { a, b, clubA, clubB, asAdmin } = await setup();
    expect((await request(app).get(`${V1}/club`).set(asAdmin(a.id))).body.data.map((c: any) => c.id)).toEqual([clubA.id]);
    expect((await request(app).get(`${V1}/club`).set(asAdmin(b.id))).body.data.map((c: any) => c.id)).toEqual([clubB.id]);
    expect((await request(app).get(`${V1}/club/pending-count`).set(asAdmin(b.id))).body.data.count).toBe(1);
    expect((await request(app).delete(`${V1}/club/${clubA.id}`).set(asAdmin(b.id))).status).toBe(404);
    expect(await prisma.incident.findUniqueOrThrow({ where: { id: clubA.id } })).toBeTruthy();
  });
});

describe("avisos · aislamiento por cliente", () => {
  it("el listado solo muestra los avisos del cliente elegido", async () => {
    const { a, b, announcementA, announcementB, asAdmin } = await setup();
    expect((await request(app).get(`${V1}/announcements`).set(asAdmin(a.id))).body.data.items.map((x: any) => x.id)).toEqual([announcementA.id]);
    expect((await request(app).get(`${V1}/announcements`).set(asAdmin(b.id))).body.data.items.map((x: any) => x.id)).toEqual([announcementB.id]);
    expect((await request(app).get(`${V1}/announcements`).set(asAdmin(b.id))).body.data.total).toBe(1);
  });

  it("en B no se puede avisar a una propiedad de A (404) y el aviso queda en B", async () => {
    const { a, b, propertyA, propertyB, asAdmin } = await setup();
    expect(
      (await request(app).post(`${V1}/announcements`).set(asAdmin(b.id)).send({ title: "Aviso cruzado", body: "No debe salir", audience: "PROPERTY", propertyId: propertyA.id })).status,
    ).toBe(404);

    const created = await request(app)
      .post(`${V1}/announcements`)
      .set(asAdmin(b.id))
      .send({ title: "Aviso B", body: "Solo residentes de B", audience: "PROPERTY", propertyId: propertyB.id });
    expect(created.status).toBe(201);
    expect((await prisma.announcement.findUniqueOrThrow({ where: { id: created.body.data.id } })).clientId).toBe(b.id);
  });

  it("los destinatarios salen solo del cliente: PROPERTY, ALL y ROLE", async () => {
    const { a, b, propertyB, residentA, residentB, guardA, guardB, asAdmin } = await setup();
    const recipientIds = async (announcementId: number) =>
      (await prisma.notification.findMany({ where: { announcementId }, select: { userId: true } })).map((n) => n.userId).sort();

    const toProperty = await request(app)
      .post(`${V1}/announcements`)
      .set(asAdmin(b.id))
      .send({ title: "Solo casa B", body: "Propiedad B", audience: "PROPERTY", propertyId: propertyB.id });
    expect(toProperty.status).toBe(201);
    expect(await recipientIds(toProperty.body.data.id)).toEqual([residentB.id]);

    const toAll = await request(app).post(`${V1}/announcements`).set(asAdmin(b.id)).send({ title: "Todos B", body: "Residentes B", audience: "ALL" });
    expect(toAll.status).toBe(201);
    expect(await recipientIds(toAll.body.data.id)).toEqual([residentB.id]);

    const toGuards = await request(app).post(`${V1}/announcements`).set(asAdmin(b.id)).send({ title: "Guardias B", body: "Solo B", audience: "ROLE", roleName: "GUARD" });
    expect(toGuards.status).toBe(201);
    expect(await recipientIds(toGuards.body.data.id)).toEqual([guardB.id]);
    expect(await recipientIds(toGuards.body.data.id)).not.toContain(guardA.id);

    // Ni el residente ni el guardia de A reciben nada de lo de B.
    const aUsers = [residentA.id, guardA.id];
    expect((await prisma.notification.count({ where: { userId: { in: aUsers } } }))).toBe(0);
    expect((await prisma.announcement.count({ where: { id: { in: [toProperty.body.data.id, toAll.body.data.id, toGuards.body.data.id] }, clientId: a.id } }))).toBe(0);
  });

  it("un aviso directo no se puede mandar a usuarios de otra organización (404)", async () => {
    const { organization, asAdmin, b } = await setup();
    const other = await buildOrganization("COMPANY", 1);
    const stranger = await buildUser("RESDN", { scope: { organizationId: other.organization.id, clientId: null } });

    expect(
      (await request(app)
        .post(`${V1}/notifications`)
        .set(asAdmin(b.id))
        .send({ userIds: [stranger.id], title: "Nope", body: "De otra organización" })).status,
    ).toBe(404);

    const own = await buildUser("RESDN", { scope: { organizationId: organization.id, clientId: null } });
    const ok = await request(app)
      .post(`${V1}/notifications`)
      .set(asAdmin(b.id))
      .send({ userIds: [own.id], title: "Aviso", body: "Misma organización" });
    expect(ok.status).toBe(202);
  });
});
