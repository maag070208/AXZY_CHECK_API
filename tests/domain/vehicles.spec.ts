/**
 * Vehículos/tags: el residente registra, ADMIN aprueba y asigna tag; caseta
 * consulta y registra acceso manual; un adeudo bloquea la entrada.
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

const adminAuth = async () => `Bearer ${tokenFor(await buildUser("ADMIN"))}`;
const guardAuth = async () => {
  const guard = await buildUser("GUARD");
  return { guard, auth: `Bearer ${tokenFor(guard)}` };
};

const makeVehicle = async (auth: string, plate = "ABC-123") =>
  request(app).post(`${api}/vehicles/me`).set("Authorization", auth).send({ plate, brand: "Toyota", model: "Corolla", color: "Blanco" });

describe("vehículos y tags", () => {
  it("residente registra, ADMIN aprueba y asigna tag", async () => {
    const property = await makeProperty("VH-1");
    const resident = await makeResident(property.id);
    const admin = await adminAuth();

    const created = await makeVehicle(resident.auth);
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ plate: "ABC-123", status: "PENDING", tagCode: null });

    const list = await request(app).get(`${api}/vehicles`).set("Authorization", admin);
    expect(list.body.data.total).toBe(1);

    const approved = await request(app)
      .patch(`${api}/vehicles/${created.body.data.id}/approve`)
      .set("Authorization", admin)
      .send({ tagCode: "tag azul 1" });
    expect(approved.status).toBe(200);
    expect(approved.body.data).toMatchObject({ status: "APPROVED", tagCode: "TAGAZUL1" });
  });

  it("caseta busca por placa/tag y registra entrada y salida", async () => {
    const property = await makeProperty("VH-2");
    const resident = await makeResident(property.id);
    const admin = await adminAuth();
    const { guard, auth: guardToken } = await guardAuth();
    const created = await makeVehicle(resident.auth);
    const approved = await request(app).patch(`${api}/vehicles/${created.body.data.id}/approve`).set("Authorization", admin).send({});
    const tag = approved.body.data.tagCode;

    const lookup = await request(app).get(`${api}/vehicles/lookup?q=${encodeURIComponent(tag)}`).set("Authorization", guardToken);
    expect(lookup.status).toBe(200);
    expect(lookup.body.data).toHaveLength(1);
    expect(lookup.body.data[0]).toMatchObject({ id: created.body.data.id, tagCode: tag });

    const entry = await request(app)
      .post(`${api}/vehicles/${created.body.data.id}/access`)
      .set("Authorization", guardToken)
      .send({ direction: "ENTRY" });
    expect(entry.status).toBe(200);
    expect(entry.body.data.event).toMatchObject({ decision: "ALLOWED", method: "TAG", direction: "ENTRY", vehicleId: created.body.data.id, guardId: guard.id });

    const exit = await request(app)
      .post(`${api}/vehicles/${created.body.data.id}/access`)
      .set("Authorization", guardToken)
      .send({ direction: "EXIT" });
    expect(exit.status).toBe(200);
    expect(exit.body.data.event).toMatchObject({ decision: "ALLOWED", direction: "EXIT" });
  });

  it("bloquea la entrada del vehículo si la propiedad tiene adeudo", async () => {
    const property = await makeProperty("VH-3");
    const resident = await makeResident(property.id);
    const admin = await adminAuth();
    const { auth: guardToken } = await guardAuth();
    const created = await makeVehicle(resident.auth);
    await request(app).patch(`${api}/vehicles/${created.body.data.id}/approve`).set("Authorization", admin).send({});

    await request(app).post(`${api}/charges`).set("Authorization", admin).send({
      propertyId: property.id,
      residentId: resident.user.id,
      concept: "Cuota vencida",
      category: "EXTRA",
      amount: 900,
      dueDate: new Date(Date.now() - 40 * DAY).toISOString().slice(0, 10),
    });

    const entry = await request(app)
      .post(`${api}/vehicles/${created.body.data.id}/access`)
      .set("Authorization", guardToken)
      .send({ direction: "ENTRY" });
    expect(entry.status).toBe(403);
    expect(entry.body.code).toBe("ACCESS_BLOCKED_BY_DEBT");

    const event = await prisma.accessEvent.findFirstOrThrow({ where: { vehicleId: created.body.data.id }, orderBy: { id: "desc" } });
    expect(event).toMatchObject({ decision: "DENIED", reason: "PROPERTY_DEBT" });
  });

  it("respeta el cupo de vehículos de la propiedad", async () => {
    const property = await makeProperty("VH-5");
    await prisma.property.update({ where: { id: property.id }, data: { vehicleQuota: 1 } });
    const resident = await makeResident(property.id);

    expect((await makeVehicle(resident.auth, "ABC-001")).status).toBe(201);
    const second = await makeVehicle(resident.auth, "ABC-002");
    expect(second.status).toBe(409);
    expect(second.body.code).toBe("VEHICLE_QUOTA_REACHED");
  });

  it("editar un vehículo aprobado lo regresa a revisión y retira el tag", async () => {
    const property = await makeProperty("VH-6");
    const resident = await makeResident(property.id);
    const admin = await adminAuth();
    const created = await makeVehicle(resident.auth, "ABC-100");
    const approved = await request(app).patch(`${api}/vehicles/${created.body.data.id}/approve`).set("Authorization", admin).send({ tagCode: "TAG-EDIT" });
    expect(approved.body.data.tagCode).toBe("TAG-EDIT");

    const edited = await request(app)
      .put(`${api}/vehicles/me/${created.body.data.id}`)
      .set("Authorization", resident.auth)
      .send({ plate: "ABC-101", brand: "Honda" });
    expect(edited.status).toBe(200);
    expect(edited.body.data).toMatchObject({ plate: "ABC-101", status: "PENDING", tagCode: null });
  });

  it("un residente no puede ver ni aprobar vehículos ajenos", async () => {
    const property = await makeProperty("VH-4");
    const resident = await makeResident(property.id);
    const otherUser = await buildUser("RESDN");
    await prisma.user.update({ where: { id: otherUser.id }, data: { propertyId: property.id } });
    const other = { user: otherUser, auth: `Bearer ${tokenFor(otherUser)}` };
    const admin = await adminAuth();
    const created = await makeVehicle(resident.auth);

    const otherList = await request(app).get(`${api}/vehicles/me`).set("Authorization", other.auth);
    expect(otherList.body.data).toHaveLength(0);
    expect((await request(app).patch(`${api}/vehicles/${created.body.data.id}/approve`).set("Authorization", resident.auth).send({})).status).toBe(403);
    expect((await request(app).get(`${api}/vehicles`).set("Authorization", resident.auth)).status).toBe(403);
    expect((await request(app).get(`${api}/vehicles`).set("Authorization", admin)).status).toBe(200);
  });
});
