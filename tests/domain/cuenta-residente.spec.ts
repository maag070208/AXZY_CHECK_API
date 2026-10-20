/**
 * [A2] Cuenta de APP desde el residente (T-A2-06, T-A2-T5).
 */
import request from "supertest";
import { app } from "@src/app";
import { createResidentUser } from "@src/modules/residents/residents.service";
import { resetDatabase, disconnectDatabase, prisma } from "../setup/db";
import { buildUser, tokenFor } from "../factories";

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await disconnectDatabase();
});

const adminToken = async () => `Bearer ${tokenFor(await buildUser("ADMIN"))}`;

const propertyWithOwner = async (identifier: string) => {
  const kind = await prisma.propertyKind.findUniqueOrThrow({ where: { code: "HOUSE" } });
  const vacant = await prisma.occupancyStatus.findUniqueOrThrow({ where: { code: "VACANT" } });
  const type = await prisma.propertyType.findUniqueOrThrow({ where: { name: "CASA" } });
  const status = await prisma.propertyStatus.findUniqueOrThrow({ where: { name: "VACNT" } });
  return prisma.property.create({
    data: { identifier, name: identifier, mainStreet: "C", typeId: type.id, statusId: status.id, kindId: kind.id, occupancyStatusId: vacant.id },
  });
};

describe("cuenta de APP desde el residente", () => {
  it("crea el usuario RESDN vinculado a la persona y a la propiedad, y el login funciona", async () => {
    const property = await propertyWithOwner("ACC-1");
    const token = await adminToken();
    const added = await request(app).post(`/api/v1/properties/${property.id}/residents`).set("Authorization", token).send({ firstName: "Carla", kindCode: "OWNER" });
    const personId = added.body.data.person.id;

    const res = await request(app).post(`/api/v1/persons/${personId}/account`).set("Authorization", token).send({ username: "carla.acc", password: "clave123" });
    expect(res.status).toBe(201);
    const person = await prisma.person.findUniqueOrThrow({ where: { id: personId } });
    expect(person.userId).toBe(res.body.data.userId);

    const login = await request(app).post("/api/v1/users/login").send({ username: "carla.acc", password: "clave123" });
    expect(login.status).toBe(200);
    expect((await prisma.property.findUniqueOrThrow({ where: { id: property.id } })).residentCount).toBe(1);
  });

  it("T-A2-T5: una persona menor no puede tener cuenta", async () => {
    const property = await propertyWithOwner("ACC-2");
    const kid = await prisma.person.create({ data: { firstName: "Niño", birthDate: new Date(Date.now() - 9 * 365 * 24 * 3600 * 1000) } });
    await prisma.resident.create({ data: { personId: kid.id, propertyId: property.id, kindId: (await prisma.residentKind.findUniqueOrThrow({ where: { code: "FAMILY" } })).id, startDate: new Date() } });
    const res = await request(app).post(`/api/v1/persons/${kid.id}/account`).set("Authorization", await adminToken()).send({ username: "nino.acc", password: "clave123" });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("RESIDENT_MINOR_NO_ACCOUNT");
  });

  it("no se crea cuenta duplicada ni con un nombre de usuario ya usado", async () => {
    const property = await propertyWithOwner("ACC-3");
    const token = await adminToken();
    await createResidentUser({ name: "Otro", username: "ocupado", password: "x", propertyId: property.id }, {});
    const added = await request(app).post(`/api/v1/properties/${property.id}/residents`).set("Authorization", token).send({ firstName: "Dana", kindCode: "OWNER" });
    const personId = added.body.data.person.id;

    const taken = await request(app).post(`/api/v1/persons/${personId}/account`).set("Authorization", token).send({ username: "ocupado", password: "clave123" });
    expect(taken.body.code).toBe("USERNAME_TAKEN");

    const ok = await request(app).post(`/api/v1/persons/${personId}/account`).set("Authorization", token).send({ username: "dana.acc", password: "clave123" });
    expect(ok.status).toBe(201);
    const again = await request(app).post(`/api/v1/persons/${personId}/account`).set("Authorization", token).send({ username: "dana2.acc", password: "clave123" });
    expect(again.body.code).toBe("ACCOUNT_EXISTS");
  });
});
