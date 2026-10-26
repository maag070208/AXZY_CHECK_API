/**
 * Módulo 13 fase 2: reapertura de quejas dentro de 7 días, cierre automático
 * posterior y bitácora de eventos (incluido el evento del sistema sin usuario).
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

const base = "/api/v1/complaints";
const DAY = 24 * 60 * 60 * 1000;

const makeProperty = async (identifier: string) => {
  const kind = await prisma.propertyKind.findUniqueOrThrow({ where: { code: "HOUSE" } });
  const vacant = await prisma.occupancyStatus.findUniqueOrThrow({ where: { code: "VACANT" } });
  const type = await prisma.propertyType.findUniqueOrThrow({ where: { name: "CASA" } });
  const status = await prisma.propertyStatus.findUniqueOrThrow({ where: { name: "VACNT" } });
  const property = await prisma.property.create({
    data: { identifier, name: identifier, mainStreet: "Calle", typeId: type.id, statusId: status.id, kindId: kind.id, occupancyStatusId: vacant.id },
  });
  await prisma.occupancyPeriod.create({ data: { propertyId: property.id, statusId: vacant.id, startDate: new Date() } });
  return property;
};

const makeResident = async (propertyId: number) => {
  const user = await buildUser("RESDN");
  const kind = await prisma.residentKind.findUniqueOrThrow({ where: { code: "OWNER" } });
  const person = await prisma.person.create({ data: { firstName: user.name, userId: user.id } });
  await prisma.resident.create({ data: { personId: person.id, propertyId, kindId: kind.id, isPrimary: true, startDate: new Date() } });
  return { user, auth: `Bearer ${tokenFor(user)}` };
};

const staffAuth = async () => `Bearer ${tokenFor(await buildUser("ADMIN"))}`;

const createComplaint = async (auth: string) => {
  const res = await request(app)
    .post(base)
    .set("Authorization", auth)
    .send({ category: "RUIDO", title: "Ruido nocturno", description: "Música fuerte después de medianoche" });
  return res.body.data.id as number;
};

const resolve = async (auth: string, id: number) => {
  await request(app).patch(`${base}/${id}/status`).set("Authorization", auth).send({ status: "IN_REVIEW" });
  const resolved = await request(app).patch(`${base}/${id}/status`).set("Authorization", auth).send({ status: "RESOLVED" });
  expect(resolved.status).toBe(200);
  return resolved;
};

const ageResolution = async (id: number, days: number) => {
  await prisma.complaint.update({
    where: { id },
    data: { resolvedAt: new Date(Date.now() - days * DAY) },
  });
};

describe("reapertura de quejas (fase 2)", () => {
  it("el residente reabre su queja RESOLVED dentro de los 7 días y queda el evento", async () => {
    const property = await makeProperty("R-1");
    const resident = await makeResident(property.id);
    const admin = await staffAuth();
    const id = await createComplaint(resident.auth);
    await resolve(admin, id);
    await ageResolution(id, 6);

    const res = await request(app).post(`${base}/${id}/reopen`).set("Authorization", resident.auth);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("REOPENED");

    const row = await prisma.complaint.findUniqueOrThrow({ where: { id } });
    expect(row.status).toBe("REOPENED");
    expect(row.resolvedAt).toBeNull();

    const last = await prisma.complaintEvent.findFirstOrThrow({ where: { complaintId: id }, orderBy: { id: "desc" } });
    expect(last).toMatchObject({ fromStatus: "RESOLVED", toStatus: "REOPENED", byUserId: resident.user.id });
  });

  it("después de 7 días la queja se cierra sola y la reapertura se rechaza", async () => {
    const property = await makeProperty("R-2");
    const resident = await makeResident(property.id);
    const admin = await staffAuth();
    const id = await createComplaint(resident.auth);
    await resolve(admin, id);
    await ageResolution(id, 8);

    const reopened = await request(app).post(`${base}/${id}/reopen`).set("Authorization", resident.auth);
    expect(reopened.status).toBe(409);

    const row = await prisma.complaint.findUniqueOrThrow({ where: { id } });
    expect(row.status).toBe("CLOSED");

    const event = await prisma.complaintEvent.findFirstOrThrow({ where: { complaintId: id }, orderBy: { id: "desc" } });
    expect(event).toMatchObject({ fromStatus: "RESOLVED", toStatus: "CLOSED", byUserId: null });
  });

  it("el residente no reabre la queja de otro (404) ni el personal puede reabrirla (403)", async () => {
    const a = await makeResident((await makeProperty("R-A")).id);
    const b = await makeResident((await makeProperty("R-B")).id);
    const admin = await staffAuth();
    const id = await createComplaint(a.auth);
    await resolve(admin, id);

    expect((await request(app).post(`${base}/${id}/reopen`).set("Authorization", b.auth)).status).toBe(404);
    expect((await request(app).post(`${base}/${id}/reopen`).set("Authorization", admin)).status).toBe(403);
  });

  it("una queja que no está RESOLVED no se puede reabrir (409)", async () => {
    const property = await makeProperty("R-3");
    const resident = await makeResident(property.id);
    const id = await createComplaint(resident.auth);

    const res = await request(app).post(`${base}/${id}/reopen`).set("Authorization", resident.auth);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("INVALID_TRANSITION");
  });

  it("el personal puede mover una queja REOPENED a IN_REVIEW y el residente puede volver a escribir", async () => {
    const property = await makeProperty("R-4");
    const resident = await makeResident(property.id);
    const admin = await staffAuth();
    const id = await createComplaint(resident.auth);
    await resolve(admin, id);

    await request(app).post(`${base}/${id}/reopen`).set("Authorization", resident.auth);
    const moved = await request(app).patch(`${base}/${id}/status`).set("Authorization", admin).send({ status: "IN_REVIEW" });
    expect(moved.status).toBe(200);
    expect(moved.body.data.status).toBe("IN_REVIEW");

    const reply = await request(app).post(`${base}/${id}/messages`).set("Authorization", resident.auth).send({ body: "Sigue pasando" });
    expect(reply.status).toBe(201);
  });
});
