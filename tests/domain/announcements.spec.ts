/**
 * Avisos/comunicados: ADMIN envía, SHIFT consulta, el residente recibe y marca leído.
 */
import request from "supertest";
import { app } from "@src/app";
import { resetDatabase, disconnectDatabase, prisma } from "../setup/db";
import { buildUser, tokenFor } from "../factories";

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await disconnectDatabase();
});

const api = "/api/v1";

const makeProperty = async (identifier: string) => {
  const kind = await prisma.propertyKind.findUniqueOrThrow({ where: { code: "HOUSE" } });
  const vacant = await prisma.occupancyStatus.findUniqueOrThrow({ where: { code: "VACANT" } });
  const type = await prisma.propertyType.findUniqueOrThrow({ where: { name: "CASA" } });
  const status = await prisma.propertyStatus.findUniqueOrThrow({ where: { name: "VACNT" } });
  return prisma.property.create({
    data: { identifier, name: identifier, mainStreet: "Calle", typeId: type.id, statusId: status.id, kindId: kind.id, occupancyStatusId: vacant.id },
  });
};

const makeResident = async (propertyId: number) => {
  const user = await buildUser("RESDN");
  await prisma.user.update({ where: { id: user.id }, data: { propertyId } });
  return { user, auth: `Bearer ${tokenFor(user)}` };
};

const adminAuth = async () => `Bearer ${tokenFor(await buildUser("ADMIN"))}`;

describe("avisos y comunicados", () => {
  it("ADMIN envía a todos los residentes y el residente lo lee", async () => {
    const property = await makeProperty("AV-1");
    const resident = await makeResident(property.id);
    const other = await makeResident(property.id);
    const admin = await adminAuth();

    const created = await request(app)
      .post(`${api}/announcements`)
      .set("Authorization", admin)
      .send({ title: "Corte de agua", body: "El martes de 9 a 13 h.", audience: "ALL" });
    expect(created.status).toBe(201);
    expect(created.body.data.recipients).toBe(2);

    const inbox = await request(app).get(`${api}/notifications/me`).set("Authorization", resident.auth);
    expect(inbox.status).toBe(200);
    expect(inbox.body.data.items[0]).toMatchObject({ title: "Corte de agua", body: "El martes de 9 a 13 h." });
    expect(inbox.body.data.items[0]).toHaveProperty("announcement");

    const unread = await request(app).get(`${api}/notifications/me/unread-count`).set("Authorization", resident.auth);
    expect(unread.body.data.count).toBe(1);

    const notificationId = inbox.body.data.items[0].id;
    const read = await request(app).patch(`${api}/notifications/${notificationId}/read`).set("Authorization", resident.auth);
    expect(read.status).toBe(200);
    expect(read.body.data.readAt).not.toBeNull();

    const after = await request(app).get(`${api}/notifications/me/unread-count`).set("Authorization", other.auth);
    expect(after.body.data.count).toBe(1);
  });

  it("una propiedad solo recibe su comunicado", async () => {
    const one = await makeProperty("AV-2");
    const two = await makeProperty("AV-3");
    const residentOne = await makeResident(one.id);
    const residentTwo = await makeResident(two.id);
    const admin = await adminAuth();

    const created = await request(app)
      .post(`${api}/announcements`)
      .set("Authorization", admin)
      .send({ title: "Solo torre A", body: "Mensaje para la propiedad A.", audience: "PROPERTY", propertyId: one.id });
    expect(created.status).toBe(201);
    expect(created.body.data.recipients).toBe(1);

    const inboxOne = await request(app).get(`${api}/notifications/me`).set("Authorization", residentOne.auth);
    expect(inboxOne.body.data.total).toBe(1);
    const inboxTwo = await request(app).get(`${api}/notifications/me`).set("Authorization", residentTwo.auth);
    expect(inboxTwo.body.data.total).toBe(0);
  });

  it("envía a un rol específico sin tocar a los residentes", async () => {
    const admin = await adminAuth();
    const guard = await buildUser("GUARD");
    const property = await makeProperty("AV-6");
    const resident = await makeResident(property.id);

    const created = await request(app)
      .post(`${api}/announcements`)
      .set("Authorization", admin)
      .send({ title: "Solo guardias", body: "Revisión de equipo.", audience: "ROLE", roleName: "GUARD" });
    expect(created.status).toBe(201);
    expect(created.body.data.recipients).toBe(1);

    const guardInbox = await request(app).get(`${api}/notifications/me`).set("Authorization", `Bearer ${tokenFor(guard)}`);
    expect(guardInbox.body.data.total).toBe(1);
    const residentInbox = await request(app).get(`${api}/notifications/me`).set("Authorization", resident.auth);
    expect(residentInbox.body.data.total).toBe(0);
  });

  it("SHIFT consulta pero no envía; el residente no consulta la lista administrativa", async () => {
    const shift = `Bearer ${tokenFor(await buildUser("SHIFT"))}`;
    const property = await makeProperty("AV-4");
    const resident = await makeResident(property.id);

    expect((await request(app).get(`${api}/announcements`).set("Authorization", shift)).status).toBe(200);
    expect((await request(app).post(`${api}/announcements`).set("Authorization", shift).send({ title: "No", body: "No", audience: "ALL" })).status).toBe(403);
    expect((await request(app).get(`${api}/announcements`).set("Authorization", resident.auth)).status).toBe(403);
  });

  it("registra y renueva el token push del dispositivo", async () => {
    const property = await makeProperty("AV-5");
    const resident = await makeResident(property.id);
    const token = "fcm-token-android-1234567890";

    const first = await request(app).post(`${api}/notifications/devices`).set("Authorization", resident.auth).send({ token, platform: "android" });
    expect(first.status).toBe(200);
    expect(first.body.data).toMatchObject({ token, platform: "android" });

    const second = await request(app).post(`${api}/notifications/devices`).set("Authorization", resident.auth).send({ token, platform: "android" });
    expect(second.status).toBe(200);
    expect(await prisma.pushDevice.count({ where: { token } })).toBe(1);
  });

  it("no envía si no hay destinatarios", async () => {
    const admin = await adminAuth();
    const response = await request(app)
      .post(`${api}/announcements`)
      .set("Authorization", admin)
      .send({ title: "Sin nadie", body: "No hay residentes todavía.", audience: "ALL" });
    expect(response.status).toBe(400);
    expect(response.body.code).toBe("ANNOUNCEMENT_NO_RECIPIENTS");
  });
});
