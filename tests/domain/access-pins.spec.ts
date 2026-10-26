/**
 * Clave peatonal: PIN de 6 dígitos, hash sin texto plano, bloqueo por intentos,
 * validación en caseta y bloqueo por adeudo.
 */
import request from "supertest";
import { app } from "@src/app";
import { resetDatabase, disconnectDatabase, prisma } from "../setup/db";
import { buildUser, tokenFor } from "../factories";
import { resetPinAttempts } from "@src/modules/access-pins/access-pins.service";

beforeEach(async () => {
  await resetDatabase();
  resetPinAttempts();
});

afterAll(async () => {
  await disconnectDatabase();
});

const api = "/api/v1";
const DAY = 24 * 60 * 60 * 1000;

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
  const kind = await prisma.residentKind.findUniqueOrThrow({ where: { code: "OWNER" } });
  const person = await prisma.person.create({ data: { firstName: user.name, userId: user.id } });
  await prisma.resident.create({ data: { personId: person.id, propertyId, kindId: kind.id, isPrimary: true, startDate: new Date() } });
  return { user, auth: `Bearer ${tokenFor(user)}` };
};

const guardAuth = async () => {
  const guard = await buildUser("GUARD");
  return { guard, auth: `Bearer ${tokenFor(guard)}` };
};

const generatePin = async (auth: string) => {
  const response = await request(app).post(`${api}/access-pins/me`).set("Authorization", auth);
  expect(response.status).toBe(201);
  return response.body.data.pin as string;
};

describe("clave peatonal", () => {
  it("el residente genera un PIN de 6 dígitos y solo se guarda su hash", async () => {
    const property = await makeProperty("PIN-1");
    const resident = await makeResident(property.id);
    const pin = await generatePin(resident.auth);
    expect(pin).toMatch(/^\d{6}$/);

    const stored = await prisma.accessPin.findFirstOrThrow({ where: { userId: resident.user.id } });
    expect(stored.pinHash).not.toBe(pin);
    expect(stored.pinHash).toHaveLength(64);

    const status = await request(app).get(`${api}/access-pins/me`).set("Authorization", resident.auth);
    expect(status.body.data).toMatchObject({ active: true });
    expect(status.body.data).not.toHaveProperty("pin");
  });

  it("caseta valida el PIN y registra el acceso permitido", async () => {
    const property = await makeProperty("PIN-2");
    const resident = await makeResident(property.id);
    const pin = await generatePin(resident.auth);
    const { guard, auth: guardToken } = await guardAuth();

    const response = await request(app).post(`${api}/access-pins/validate`).set("Authorization", guardToken).send({ pin });
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ valid: true, property: { identifier: "PIN-2" } });

    const event = await prisma.accessEvent.findFirstOrThrow({ where: { propertyId: property.id }, orderBy: { id: "desc" } });
    expect(event).toMatchObject({ method: "PIN", decision: "ALLOWED", guardId: guard.id });
  });

  it("bloquea la validación después de 5 intentos fallidos por guardia", async () => {
    const property = await makeProperty("PIN-3");
    const resident = await makeResident(property.id);
    const pin = await generatePin(resident.auth);
    const { auth: guardToken } = await guardAuth();

    for (let i = 0; i < 4; i += 1) {
      const wrong = await request(app).post(`${api}/access-pins/validate`).set("Authorization", guardToken).send({ pin: "000000" });
      expect(wrong.status).toBe(200);
      expect(wrong.body.data.valid).toBe(false);
    }
    const fifth = await request(app).post(`${api}/access-pins/validate`).set("Authorization", guardToken).send({ pin: "000000" });
    expect(fifth.status).toBe(423);
    expect(fifth.body.code).toBe("PIN_TOO_MANY_ATTEMPTS");

    const blocked = await request(app).post(`${api}/access-pins/validate`).set("Authorization", guardToken).send({ pin });
    expect(blocked.status).toBe(423);
  });

  it("un PIN válido no entra si la propiedad tiene adeudo", async () => {
    const property = await makeProperty("PIN-4");
    const resident = await makeResident(property.id);
    const pin = await generatePin(resident.auth);
    const admin = `Bearer ${tokenFor(await buildUser("ADMIN"))}`;
    const { auth: guardToken } = await guardAuth();

    await request(app).post(`${api}/charges`).set("Authorization", admin).send({
      propertyId: property.id,
      residentId: resident.user.id,
      concept: "Cuota vencida",
      category: "EXTRA",
      amount: 900,
      dueDate: new Date(Date.now() - 40 * DAY).toISOString().slice(0, 10),
    });

    const response = await request(app).post(`${api}/access-pins/validate`).set("Authorization", guardToken).send({ pin });
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ valid: false, reason: "PROPERTY_DEBT" });
    const event = await prisma.accessEvent.findFirstOrThrow({ where: { propertyId: property.id }, orderBy: { id: "desc" } });
    expect(event).toMatchObject({ decision: "DENIED", reason: "PROPERTY_DEBT" });
  });

  it("al revocar el PIN deja de ser válido y el residente no puede validar", async () => {
    const property = await makeProperty("PIN-5");
    const resident = await makeResident(property.id);
    const pin = await generatePin(resident.auth);
    const { auth: guardToken } = await guardAuth();

    await request(app).delete(`${api}/access-pins/me`).set("Authorization", resident.auth);
    const response = await request(app).post(`${api}/access-pins/validate`).set("Authorization", guardToken).send({ pin });
    expect(response.body.data.valid).toBe(false);
    expect((await request(app).post(`${api}/access-pins/validate`).set("Authorization", resident.auth).send({ pin })).status).toBe(403);
    expect((await request(app).post(`${api}/access-pins/me`).set("Authorization", guardToken)).status).toBe(403);
  });
});
