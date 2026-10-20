/**
 * [A1] Propiedades y ocupación: transiciones (datos), inquilino obligatorio en RENTED,
 * baja de residentes con confirmación, un solo periodo vigente (índice parcial),
 * conteo de residentes en la misma transacción y permisos por rol.
 */
import request from "supertest";
import { app } from "@src/app";
import { createResidentUser } from "@src/modules/residents/residents.service";
import { findResidentCountDrift } from "@src/modules/properties/resident-count";
import { resetDatabase, disconnectDatabase, prisma } from "../setup/db";
import { buildUser, tokenFor } from "../factories";

const API = "/api/v1/properties";

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await disconnectDatabase();
});

const auth = async (role: "ADMIN" | "SHIFT" | "GUARD") => `Bearer ${tokenFor(await buildUser(role))}`;

let propertySeq = 0;
/** Propiedad nueva vía la API, con su tipo y estado legados (CASA / VACNT). */
const createProperty = async (token: string) => {
  const type = await prisma.propertyType.findUniqueOrThrow({ where: { name: "CASA" } });
  const status = await prisma.propertyStatus.findUniqueOrThrow({ where: { name: "VACNT" } });
  propertySeq++;
  const res = await request(app)
    .post(API)
    .set("Authorization", token)
    .send({ identifier: `OCC-${propertySeq}`, name: `Casa ${propertySeq}`, mainStreet: "Calle 1", typeId: type.id, statusId: status.id });
  expect(res.status).toBe(201);
  return res.body.data as { id: number };
};

const person = (firstName: string) => prisma.person.create({ data: { firstName } });

const currentStatus = async (propertyId: number) =>
  (await prisma.property.findUniqueOrThrow({ where: { id: propertyId }, include: { occupancyStatus: true } })).occupancyStatus.code;

describe("crear propiedad", () => {
  it("nace con tipo, ocupación y un periodo vigente", async () => {
    const admin = await auth("ADMIN");
    const property = await createProperty(admin);
    const row = await prisma.property.findUniqueOrThrow({ where: { id: property.id }, include: { kind: true, occupancyStatus: true } });
    expect(row.kind.code).toBe("HOUSE");
    expect(row.occupancyStatus.code).toBe("VACANT");
    const periods = await prisma.occupancyPeriod.findMany({ where: { propertyId: property.id, endDate: null } });
    expect(periods).toHaveLength(1);
  });
});

describe("cambio de ocupación", () => {
  it("T1: Vacía → Rentada sin inquilino responde OCCUPANCY_TENANT_REQUIRED", async () => {
    const admin = await auth("ADMIN");
    const property = await createProperty(admin);
    const res = await request(app).post(`${API}/${property.id}/occupancy`).set("Authorization", admin).send({ status: "RENTED" });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("OCCUPANCY_TENANT_REQUIRED");
    expect(await currentStatus(property.id)).toBe("VACANT");
  });

  it("T2: un cambio válido cierra el periodo previo y abre uno nuevo (historial de 2)", async () => {
    const admin = await auth("ADMIN");
    const property = await createProperty(admin);
    const tenant = await person("Inquilino");

    const res = await request(app)
      .post(`${API}/${property.id}/occupancy`)
      .set("Authorization", admin)
      .send({ status: "RENTED", tenantPersonId: tenant.id });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe("RENTED");

    const history = await prisma.occupancyPeriod.findMany({ where: { propertyId: property.id }, orderBy: { id: "asc" } });
    expect(history).toHaveLength(2);
    expect(history[0].endDate).not.toBeNull();
    expect(history[1].endDate).toBeNull();
    expect(history[1].tenantPersonId).toBe(tenant.id);
    expect(await currentStatus(property.id)).toBe("RENTED");
  });

  it("T3: el índice parcial impide dos periodos vigentes para la misma propiedad", async () => {
    const admin = await auth("ADMIN");
    const property = await createProperty(admin);
    const status = await prisma.occupancyStatus.findUniqueOrThrow({ where: { code: "FOR_RENT" } });
    await expect(
      prisma.occupancyPeriod.create({ data: { propertyId: property.id, statusId: status.id, startDate: new Date() } }),
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("T4: una transición no permitida (Bloqueada → Rentada) responde 409 INVALID_TRANSITION", async () => {
    const admin = await auth("ADMIN");
    const property = await createProperty(admin);
    const blocked = await request(app).post(`${API}/${property.id}/occupancy`).set("Authorization", admin).send({ status: "BLOCKED" });
    expect(blocked.status).toBe(201);

    const tenant = await person("Inquilino");
    const res = await request(app)
      .post(`${API}/${property.id}/occupancy`)
      .set("Authorization", admin)
      .send({ status: "RENTED", tenantPersonId: tenant.id });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("INVALID_TRANSITION");
  });

  it("T5 y T6: con residentes, pasar a Vacía exige confirmar la baja; el conteo se mantiene", async () => {
    const admin = await auth("ADMIN");
    const property = await createProperty(admin);
    await request(app).post(`${API}/${property.id}/occupancy`).set("Authorization", admin).send({ status: "OWNER_OCCUPIED" });

    await createResidentUser({ name: "Ana", username: "ana_occ", password: "x", propertyId: property.id }, {});
    await createResidentUser({ name: "Beto", username: "beto_occ", password: "x", propertyId: property.id }, {});
    expect((await prisma.property.findUniqueOrThrow({ where: { id: property.id } })).residentCount).toBe(2);

    const sinConfirmar = await request(app).post(`${API}/${property.id}/occupancy`).set("Authorization", admin).send({ status: "VACANT" });
    expect(sinConfirmar.status).toBe(409);
    expect(sinConfirmar.body.code).toBe("OCCUPANCY_HAS_RESIDENTS");
    expect(await currentStatus(property.id)).toBe("OWNER_OCCUPIED");

    const confirmado = await request(app)
      .post(`${API}/${property.id}/occupancy`)
      .set("Authorization", admin)
      .send({ status: "VACANT", releaseResidents: true });
    expect(confirmado.status).toBe(201);

    const after = await prisma.property.findUniqueOrThrow({ where: { id: property.id } });
    expect(after.residentCount).toBe(0);
    expect(await prisma.user.count({ where: { propertyId: property.id, active: true } })).toBe(0);
    expect(await findResidentCountDrift()).toEqual([]);
  });

  it("el cambio de ocupación no lo puede hacer un rol sin occupancy.change", async () => {
    const admin = await auth("ADMIN");
    const property = await createProperty(admin);
    const res = await request(app).post(`${API}/${property.id}/occupancy`).set("Authorization", await auth("SHIFT")).send({ status: "FOR_RENT" });
    expect(res.status).toBe(403);
  });
});

describe("consulta de ocupación (contrato)", () => {
  it("T8: devuelve vigente e historial; el guardia recibe 403", async () => {
    const admin = await auth("ADMIN");
    const property = await createProperty(admin);

    const shift = await request(app).get(`${API}/${property.id}/occupancy`).set("Authorization", await auth("SHIFT"));
    expect(shift.status).toBe(200);
    expect(shift.body.data).toEqual(
      expect.objectContaining({
        propertyId: property.id,
        status: expect.objectContaining({ code: "VACANT" }),
        residentCount: 0,
        current: expect.objectContaining({ endDate: null }),
        history: expect.any(Array),
      }),
    );

    const guard = await request(app).get(`${API}/${property.id}/occupancy`).set("Authorization", await auth("GUARD"));
    expect(guard.status).toBe(403);
  });
});

describe("propietario", () => {
  it("el cambio de propietario queda en el historial y actualiza la propiedad", async () => {
    const admin = await auth("ADMIN");
    const property = await createProperty(admin);
    const owner = await person("Propietario");

    const res = await request(app).post(`${API}/${property.id}/ownership`).set("Authorization", admin).send({ toPersonId: owner.id });
    expect(res.status).toBe(201);

    const row = await prisma.property.findUniqueOrThrow({ where: { id: property.id } });
    expect(row.ownerPersonId).toBe(owner.id);
    expect(await prisma.ownershipChange.count({ where: { propertyId: property.id, toPersonId: owner.id } })).toBe(1);
  });
});

describe("edificios", () => {
  it("crear un edificio y rechazar un nombre repetido", async () => {
    const admin = await auth("ADMIN");
    const ok = await request(app).post("/api/v1/buildings").set("Authorization", admin).send({ name: "Torre A", floors: 5 });
    expect(ok.status).toBe(201);
    const dup = await request(app).post("/api/v1/buildings").set("Authorization", admin).send({ name: "Torre A" });
    expect(dup.status).toBe(409);
    expect(dup.body.code).toBe("BUILDING_EXISTS");
  });
});
