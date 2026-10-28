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

  it("usa la casa del vínculo Person → Resident aunque User.propertyId tenga otra", async () => {
    const houseA = await makeProperty("PIN-LINK-A");
    const houseB = await makeProperty("PIN-LINK-B");
    const resident = await makeResident(houseA.id);
    await prisma.user.update({ where: { id: resident.user.id }, data: { propertyId: houseB.id } });

    const pin = await generatePin(resident.auth);
    const stored = await prisma.accessPin.findFirstOrThrow({ where: { userId: resident.user.id, active: true } });
    expect(stored.propertyId).toBe(houseA.id);

    const { auth: guardToken } = await guardAuth();
    const validated = await request(app).post(`${api}/access-pins/validate`).set("Authorization", guardToken).send({ pin });
    expect(validated.body.data).toMatchObject({ valid: true, property: { identifier: "PIN-LINK-A" } });
  });

  it("usa User.propertyId como respaldo si no hay vínculo de residente", async () => {
    const property = await makeProperty("PIN-LEGACY");
    const user = await buildUser("RESDN");
    await prisma.user.update({ where: { id: user.id }, data: { propertyId: property.id } });
    const auth = `Bearer ${tokenFor(user)}`;

    const pin = await generatePin(auth);
    const stored = await prisma.accessPin.findFirstOrThrow({ where: { userId: user.id, active: true } });
    expect(stored.propertyId).toBe(property.id);
  });

  it("el residente puede elegir su propia clave y se valida igual", async () => {
    const property = await makeProperty("PIN-CUSTOM");
    const resident = await makeResident(property.id);
    const { auth: guardToken } = await guardAuth();

    const created = await request(app).post(`${api}/access-pins/me`).set("Authorization", resident.auth).send({ pin: "246810" });
    expect(created.status).toBe(201);
    expect(created.body.data.pin).toBe("246810");

    const validated = await request(app).post(`${api}/access-pins/validate`).set("Authorization", guardToken).send({ pin: "246810" });
    expect(validated.status).toBe(200);
    expect(validated.body.data.valid).toBe(true);
  });

  it("rechaza una clave que ya está en uso sin revocar la anterior", async () => {
    const one = await makeProperty("PIN-DUP-1");
    const two = await makeProperty("PIN-DUP-2");
    const first = await makeResident(one.id);
    const second = await makeResident(two.id);

    expect((await request(app).post(`${api}/access-pins/me`).set("Authorization", first.auth).send({ pin: "135790" })).status).toBe(201);
    const duplicate = await request(app).post(`${api}/access-pins/me`).set("Authorization", second.auth).send({ pin: "135790" });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.code).toBe("PIN_IN_USE");
    expect(await prisma.accessPin.count({ where: { userId: second.user.id, active: true } })).toBe(0);
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

  it("emite un pase QR personal y lo valida en caseta", async () => {
    const property = await makeProperty("PIN-QR");
    const resident = await makeResident(property.id);
    const { guard, auth: guardToken } = await guardAuth();

    const issued = await request(app).post(`${api}/access-pins/me/qr/token`).set("Authorization", resident.auth);
    expect(issued.status).toBe(200);
    expect(issued.body.data.token).toMatch(/^AXZ-P-[A-F0-9]{6}$/);
    expect(issued.body.data.expiresIn).toBe(60);

    const status = await request(app).get(`${api}/access-pins/me/qr`).set("Authorization", resident.auth);
    expect(status.body.data.active).toBe(true);

    const validated = await request(app)
      .post(`${api}/access-pins/pass/validate`)
      .set("Authorization", guardToken)
      .send({ token: issued.body.data.token });
    expect(validated.status).toBe(200);
    expect(validated.body.data).toMatchObject({ valid: true, property: { identifier: "PIN-QR" } });

    const event = await prisma.accessEvent.findFirstOrThrow({ where: { propertyId: property.id }, orderBy: { id: "desc" } });
    expect(event).toMatchObject({ method: "QR", decision: "ALLOWED", reason: "PERSONAL_QR", guardId: guard.id });
  });

  it("el QR personal usa la casa del vínculo aunque User.propertyId sea otra", async () => {
    const houseA = await makeProperty("PIN-QR-LINK-A");
    const houseB = await makeProperty("PIN-QR-LINK-B");
    const resident = await makeResident(houseA.id);
    await prisma.user.update({ where: { id: resident.user.id }, data: { propertyId: houseB.id } });
    const { auth: guardToken } = await guardAuth();

    const issued = await request(app).post(`${api}/access-pins/me/qr/token`).set("Authorization", resident.auth);
    expect(issued.status).toBe(200);

    const pass = await prisma.personalQrPass.findFirstOrThrow({ where: { userId: resident.user.id, active: true } });
    expect(pass.propertyId).toBe(houseA.id);

    const validated = await request(app)
      .post(`${api}/access-pins/pass/validate`)
      .set("Authorization", guardToken)
      .send({ token: issued.body.data.token });
    expect(validated.body.data).toMatchObject({ valid: true, property: { identifier: "PIN-QR-LINK-A" } });
  });

  it("rechaza un pase QR expirado o revocado", async () => {
    const property = await makeProperty("PIN-QR-2");
    const resident = await makeResident(property.id);
    const { auth: guardToken } = await guardAuth();
    const issued = await request(app).post(`${api}/access-pins/me/qr/token`).set("Authorization", resident.auth);
    const pass = await prisma.personalQrPass.findFirstOrThrow({ where: { userId: resident.user.id, active: true } });

    await prisma.personalQrPass.update({ where: { id: pass.id }, data: { codeExpiresAt: new Date(Date.now() - 1000) } });
    const expiredResponse = await request(app)
      .post(`${api}/access-pins/pass/validate`)
      .set("Authorization", guardToken)
      .send({ token: issued.body.data.token });
    expect(expiredResponse.body.data).toMatchObject({ valid: false, reason: "EXPIRED_QR" });

    expect((await request(app).delete(`${api}/access-pins/me/qr`).set("Authorization", resident.auth)).status).toBe(200);
    const revoked = await request(app)
      .post(`${api}/access-pins/pass/validate`)
      .set("Authorization", guardToken)
      .send({ token: issued.body.data.token });
    expect(revoked.body.data).toMatchObject({ valid: false, reason: "INVALID_QR" });
  });

  it("un pase QR personal no entra si la propiedad tiene adeudo", async () => {
    const property = await makeProperty("PIN-QR-DEBT");
    const resident = await makeResident(property.id);
    const admin = `Bearer ${tokenFor(await buildUser("ADMIN"))}`;
    const { auth: guardToken } = await guardAuth();
    const issued = await request(app).post(`${api}/access-pins/me/qr/token`).set("Authorization", resident.auth);

    await request(app).post(`${api}/charges`).set("Authorization", admin).send({
      propertyId: property.id,
      residentId: resident.user.id,
      concept: "Cuota vencida QR",
      category: "EXTRA",
      amount: 500,
      dueDate: new Date(Date.now() - 40 * DAY).toISOString().slice(0, 10),
    });

    const response = await request(app).post(`${api}/access-pins/pass/validate`).set("Authorization", guardToken).send({ token: issued.body.data.token });
    expect(response.body.data).toMatchObject({ valid: false, reason: "PROPERTY_DEBT" });
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
