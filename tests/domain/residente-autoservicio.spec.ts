/**
 * Autoservicio del residente: edita SU perfil de contacto y SUS contactos. Nunca los de otro
 * residente, y nunca nombre, propiedad ni documentos (eso es del personal).
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

const base = "/api/v1/residents";

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

const makeResident = async (identifier: string) => {
  const property = await makeProperty(identifier);
  const user = await buildUser("RESDN");
  const kind = await prisma.residentKind.findUniqueOrThrow({ where: { code: "OWNER" } });
  const person = await prisma.person.create({ data: { firstName: user.name, userId: user.id } });
  await prisma.resident.create({ data: { personId: person.id, propertyId: property.id, kindId: kind.id, isPrimary: true, startDate: new Date() } });
  return { user, auth: `Bearer ${tokenFor(user)}` };
};

const staffAuth = async () => `Bearer ${tokenFor(await buildUser("ADMIN"))}`;

describe("perfil propio del residente", () => {
  it("actualiza su teléfono, correo y contacto de emergencia", async () => {
    const a = await makeResident("AS-1");
    const res = await request(app)
      .put(`${base}/${a.user.id}/profile`)
      .set("Authorization", a.auth)
      .send({ phoneNumber: "6641234567", email: "ana@example.test", emergencyContact: "Luis", emergencyPhone: "6640000000" });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ phoneNumber: "6641234567", emergencyContact: "Luis" });
  });

  it("no puede editar el perfil de otro residente (403)", async () => {
    const a = await makeResident("AS-2");
    const b = await makeResident("AS-3");
    const res = await request(app).put(`${base}/${b.user.id}/profile`).set("Authorization", a.auth).send({ phoneNumber: "1" });
    expect(res.status).toBe(403);
  });

  it("no puede cambiar nombre, propiedad ni otros campos (400, schema estricto)", async () => {
    const a = await makeResident("AS-4");
    const res = await request(app)
      .put(`${base}/${a.user.id}/profile`)
      .set("Authorization", a.auth)
      .send({ phoneNumber: "1", firstName: "Otro", propertyId: 999 });
    expect(res.status).toBe(400);
  });
});

describe("foto de perfil del residente", () => {
  it("guarda la foto que devolvió la subida (url y key)", async () => {
    const a = await makeResident("AS-P1");
    const res = await request(app)
      .put(`${base}/${a.user.id}/profile`)
      .set("Authorization", a.auth)
      .send({ photoUrl: "https://files.example.test/perfil.jpg", photoKey: "resident-profile/perfil.jpg" });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ photoUrl: "https://files.example.test/perfil.jpg", photoKey: "resident-profile/perfil.jpg" });
  });

  it("rechaza una foto que no es URL (400)", async () => {
    const a = await makeResident("AS-P2");
    const res = await request(app).put(`${base}/${a.user.id}/profile`).set("Authorization", a.auth).send({ photoUrl: "no-es-url" });
    expect(res.status).toBe(400);
  });
});

describe("contactos propios del residente", () => {
  it("agrega, edita y elimina sus contactos", async () => {
    const a = await makeResident("AS-5");
    const created = await request(app)
      .post(`${base}/${a.user.id}/contacts`)
      .set("Authorization", a.auth)
      .send({ name: "Tía Rosa", phone: "6645550000" });
    expect(created.status).toBe(201);
    const contactId = created.body.data.id;

    const edited = await request(app).put(`${base}/contacts/${contactId}`).set("Authorization", a.auth).send({ phone: "6645551111" });
    expect(edited.status).toBe(200);
    expect(edited.body.data.phone).toBe("6645551111");

    const removed = await request(app).delete(`${base}/contacts/${contactId}`).set("Authorization", a.auth);
    expect(removed.status).toBe(200);
  });

  it("guarda una foto opcional en el contacto y rechaza una URL inválida", async () => {
    const a = await makeResident("AS-C1");
    const ok = await request(app)
      .post(`${base}/${a.user.id}/contacts`)
      .set("Authorization", a.auth)
      .send({ name: "Tía Rosa", photoUrl: "https://files.example.test/rosa.jpg", photoKey: "contact-photo/rosa.jpg" });
    expect(ok.status).toBe(201);
    expect(ok.body.data.photoUrl).toBe("https://files.example.test/rosa.jpg");
    const bad = await request(app).post(`${base}/${a.user.id}/contacts`).set("Authorization", a.auth).send({ name: "Tía Rosa", photoUrl: "no-es-url" });
    expect(bad.status).toBe(400);
  });

  it("no puede agregar contactos a otro residente (403)", async () => {
    const a = await makeResident("AS-6");
    const b = await makeResident("AS-7");
    const res = await request(app).post(`${base}/${b.user.id}/contacts`).set("Authorization", a.auth).send({ name: "Intruso" });
    expect(res.status).toBe(403);
  });

  it("no puede editar ni borrar contactos ajenos (404, sin revelar que existen)", async () => {
    const a = await makeResident("AS-8");
    const b = await makeResident("AS-9");
    const theirs = await prisma.residentContact.create({ data: { userId: b.user.id, name: "De B" } });

    const put = await request(app).put(`${base}/contacts/${theirs.id}`).set("Authorization", a.auth).send({ phone: "6640000000" });
    expect(put.status).toBe(404);
    const del = await request(app).delete(`${base}/contacts/${theirs.id}`).set("Authorization", a.auth);
    expect(del.status).toBe(404);

    const unchanged = await prisma.residentContact.findUniqueOrThrow({ where: { id: theirs.id } });
    expect(unchanged.active).toBe(true);
  });

  it("el personal con residents.manage sí edita cualquier contacto", async () => {
    const b = await makeResident("AS-10");
    const theirs = await prisma.residentContact.create({ data: { userId: b.user.id, name: "De B" } });
    const res = await request(app).put(`${base}/contacts/${theirs.id}`).set("Authorization", await staffAuth()).send({ phone: "6649999999" });
    expect(res.status).toBe(200);
  });
});
