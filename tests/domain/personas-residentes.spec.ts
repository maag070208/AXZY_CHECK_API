/**
 * [A2] Personas y residentes: titular único, tipos que no suman al hogar, mudanza con
 * advertencia, regla de menores, detección de duplicados y el puente con la API anterior.
 */
import request from "supertest";
import { app } from "@src/app";
import { createResidentUser, updateResidentUser } from "@src/modules/residents/residents.service";
import { findResidentCountDrift } from "@src/modules/properties/resident-count";
import { resetDatabase, disconnectDatabase, prisma } from "../setup/db";
import { buildUser, tokenFor } from "../factories";

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await disconnectDatabase();
});

const adminAuth = async () => `Bearer ${tokenFor(await buildUser("ADMIN"))}`;

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

const count = async (propertyId: number) =>
  (await prisma.property.findUniqueOrThrow({ where: { id: propertyId } })).residentCount;

describe("titular y tipos", () => {
  it("T1: un solo titular activo por propiedad (índice de base de datos)", async () => {
    const property = await makeProperty("TIT-1");
    const kind = await prisma.residentKind.findUniqueOrThrow({ where: { code: "OWNER" } });
    const a = await prisma.person.create({ data: { firstName: "A" } });
    const b = await prisma.person.create({ data: { firstName: "B" } });
    await prisma.resident.create({ data: { personId: a.id, propertyId: property.id, kindId: kind.id, isPrimary: true, startDate: new Date() } });
    await expect(
      prisma.resident.create({ data: { personId: b.id, propertyId: property.id, kindId: kind.id, isPrimary: true, startDate: new Date() } }),
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("T3: personal doméstico y autorizados no suman al conteo del hogar", async () => {
    const property = await makeProperty("TIT-3");
    const token = await adminAuth();
    const owner = await request(app).post(`/api/v1/properties/${property.id}/residents`).set("Authorization", token).send({ firstName: "Ana", kindCode: "OWNER" });
    expect(owner.status).toBe(201);
    const domestic = await request(app).post(`/api/v1/properties/${property.id}/residents`).set("Authorization", token).send({ firstName: "Rosa", kindCode: "DOMESTIC" });
    expect(domestic.status).toBe(201);
    expect(await count(property.id)).toBe(1);
    expect(await findResidentCountDrift()).toEqual([]);
  });

  it("el primer residente del hogar queda como titular; no se puede poner titular a un no miembro", async () => {
    const property = await makeProperty("TIT-4");
    const token = await adminAuth();
    const first = await request(app).post(`/api/v1/properties/${property.id}/residents`).set("Authorization", token).send({ firstName: "Ana", kindCode: "OWNER" });
    expect(first.body.data.isPrimary).toBe(true);
    const domestic = await request(app).post(`/api/v1/properties/${property.id}/residents`).set("Authorization", token).send({ firstName: "Rosa", kindCode: "DOMESTIC" });
    const denied = await request(app).post(`/api/v1/residents/${domestic.body.data.id}/primary`).set("Authorization", token);
    expect(denied.status).toBe(400);
    expect(denied.body.code).toBe("RESIDENT_NOT_HOUSEHOLD");
  });

  it("cambiar el titular deja uno solo", async () => {
    const property = await makeProperty("TIT-5");
    const token = await adminAuth();
    const a = await request(app).post(`/api/v1/properties/${property.id}/residents`).set("Authorization", token).send({ firstName: "Ana", kindCode: "OWNER" });
    const b = await request(app).post(`/api/v1/properties/${property.id}/residents`).set("Authorization", token).send({ firstName: "Luis", kindCode: "FAMILY" });
    const res = await request(app).post(`/api/v1/residents/${b.body.data.id}/primary`).set("Authorization", token);
    expect(res.status).toBe(200);
    const primaries = await prisma.resident.findMany({ where: { propertyId: property.id, isPrimary: true, status: "ACTIVE" } });
    expect(primaries.map((r) => r.id)).toEqual([b.body.data.id]);
    expect(a.body.data.id).not.toBe(b.body.data.id);
  });
});

describe("mudanza", () => {
  it("T4: el titular se muda sin reemplazo: advertencia y el historial se conserva", async () => {
    const property = await makeProperty("MUD-1");
    const token = await adminAuth();
    const a = await request(app).post(`/api/v1/properties/${property.id}/residents`).set("Authorization", token).send({ firstName: "Ana", kindCode: "OWNER" });
    const res = await request(app).post(`/api/v1/residents/${a.body.data.id}/move-out`).set("Authorization", token).send({});
    expect(res.status).toBe(200);
    expect(res.body.data.warning).toBe("PROPERTY_WITHOUT_PRIMARY");
    const row = await prisma.resident.findUniqueOrThrow({ where: { id: a.body.data.id } });
    expect(row).toMatchObject({ status: "MOVED_OUT", isPrimary: false });
    expect(row.endDate).not.toBeNull();
    expect(await count(property.id)).toBe(0);
  });

  it("con reemplazo, el nuevo titular queda designado sin advertencia", async () => {
    const property = await makeProperty("MUD-2");
    const token = await adminAuth();
    const a = await request(app).post(`/api/v1/properties/${property.id}/residents`).set("Authorization", token).send({ firstName: "Ana", kindCode: "OWNER" });
    const b = await request(app).post(`/api/v1/properties/${property.id}/residents`).set("Authorization", token).send({ firstName: "Luis", kindCode: "FAMILY" });
    const res = await request(app)
      .post(`/api/v1/residents/${a.body.data.id}/move-out`)
      .set("Authorization", token)
      .send({ replacementPrimaryId: b.body.data.id });
    expect(res.body.data.warning).toBeNull();
    expect((await prisma.resident.findUniqueOrThrow({ where: { id: b.body.data.id } })).isPrimary).toBe(true);
  });
});

describe("menores y duplicados", () => {
  it("T5: menor de edad con acceso a la APP se rechaza; sin acceso se acepta", async () => {
    const property = await makeProperty("MEN-1");
    const token = await adminAuth();
    const birth = new Date();
    birth.setUTCFullYear(birth.getUTCFullYear() - 10);
    const body = { firstName: "Niño", kindCode: "FAMILY", birthDate: birth.toISOString().slice(0, 10) };

    const conCuenta = await request(app).post(`/api/v1/properties/${property.id}/residents`).set("Authorization", token).send({ ...body, hasAppAccess: true });
    expect(conCuenta.status).toBe(400);
    expect(conCuenta.body.code).toBe("RESIDENT_MINOR_NO_ACCOUNT");

    const sinCuenta = await request(app).post(`/api/v1/properties/${property.id}/residents`).set("Authorization", token).send({ ...body, hasAppAccess: false });
    expect(sinCuenta.status).toBe(201);
  });

  it("T8: mismo teléfono advierte (409 DUPLICATE_PERSON); confirmar crea la persona", async () => {
    const property = await makeProperty("DUP-1");
    const token = await adminAuth();
    await prisma.person.create({ data: { firstName: "Ana", phone: "6640000000" } });
    const dup = await request(app).post(`/api/v1/properties/${property.id}/residents`).set("Authorization", token).send({ firstName: "Otra", phone: "6640000000", kindCode: "FAMILY" });
    expect(dup.status).toBe(409);
    expect(dup.body.code).toBe("DUPLICATE_PERSON");
    const ok = await request(app)
      .post(`/api/v1/properties/${property.id}/residents`)
      .set("Authorization", token)
      .send({ firstName: "Otra", phone: "6640000000", kindCode: "FAMILY", confirmNewPerson: true });
    expect(ok.status).toBe(201);
  });
});

describe("puente con la API anterior", () => {
  it("crear, mover y dar de baja un residente por las rutas anteriores mantiene la tabla Resident", async () => {
    const p1 = await makeProperty("PUE-1");
    const p2 = await makeProperty("PUE-2");
    const user = await createResidentUser({ name: "Mario", username: "mario_puente", password: "x", propertyId: p1.id }, {});
    expect(await count(p1.id)).toBe(1);
    const link = await prisma.resident.findFirstOrThrow({ where: { person: { userId: user.id }, status: "ACTIVE" } });
    expect(link.propertyId).toBe(p1.id);

    await updateResidentUser(user.id, { propertyId: p2.id }, {});
    expect(await count(p1.id)).toBe(0);
    expect(await count(p2.id)).toBe(1);

    const { updateUser } = await import("@src/modules/users/user.service");
    await updateUser(user.id, { active: false });
    expect(await count(p2.id)).toBe(0);
    expect(await findResidentCountDrift()).toEqual([]);
  });
});
