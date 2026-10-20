/**
 * [T-F0-04] Fábrica de catálogos: CRUD generado con reglas comunes.
 */
import request from "supertest";
import { app } from "@src/app";
import { resetDatabase, disconnectDatabase, prisma } from "../setup/db";
import { buildUser, tokenFor } from "../factories";

const BASE = "/api/v1/catalogs/property-types";

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await disconnectDatabase();
});

const auth = async (role: "ADMIN" | "GUARD") => `Bearer ${tokenFor(await buildUser(role))}`;

describe("lectura", () => {
  it("cualquier usuario autenticado lista los valores activos", async () => {
    const res = await request(app).get(BASE).set("Authorization", await auth("GUARD"));
    expect(res.status).toBe(200);
    const names = res.body.data.map((r: any) => r.name);
    expect(names).toEqual(expect.arrayContaining(["CASA", "DEPA"]));
  });

  it("sin token no hay lectura (guard global)", async () => {
    const res = await request(app).get(BASE);
    expect(res.status).toBe(401);
  });

  it("GET /catalogs lista los catálogos del registro", async () => {
    const res = await request(app).get("/api/v1/catalogs").set("Authorization", await auth("GUARD"));
    expect(res.body.data.map((c: any) => c.key)).toContain("property-types");
  });
});

describe("escritura (solo ADMIN)", () => {
  it("un guardia no puede crear valores (403)", async () => {
    const res = await request(app).post(BASE).set("Authorization", await auth("GUARD")).send({ name: "LOTE", value: "Lote" });
    expect(res.status).toBe(403);
  });

  it("el administrador crea un valor nuevo que no es del sistema", async () => {
    const res = await request(app).post(BASE).set("Authorization", await auth("ADMIN")).send({ name: "LOTE_BALDIO", value: "Lote baldío" });
    expect(res.status).toBe(201);
    const row = await prisma.propertyType.findUniqueOrThrow({ where: { name: "LOTE_BALDIO" } });
    expect(row.isSystem).toBe(false);
  });

  it("el código debe estar en MAYÚSCULAS (400)", async () => {
    const res = await request(app).post(BASE).set("Authorization", await auth("ADMIN")).send({ name: "lote", value: "Lote" });
    expect(res.status).toBe(400);
    expect(res.body.issues.map((i: any) => i.path)).toContain("body.name");
  });

  it("un código duplicado responde 409", async () => {
    const res = await request(app).post(BASE).set("Authorization", await auth("ADMIN")).send({ name: "CASA", value: "Otra" });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("CATALOG_CONFLICT");
  });

  it("no se puede renombrar el código de un valor del sistema", async () => {
    const casa = await prisma.propertyType.findUniqueOrThrow({ where: { name: "CASA" } });
    const res = await request(app).put(`${BASE}/${casa.id}`).set("Authorization", await auth("ADMIN")).send({ name: "CASA_NUEVA" });
    expect(res.status).toBe(409);
  });

  it("sí se puede cambiar la etiqueta de un valor del sistema", async () => {
    const casa = await prisma.propertyType.findUniqueOrThrow({ where: { name: "CASA" } });
    const res = await request(app).put(`${BASE}/${casa.id}`).set("Authorization", await auth("ADMIN")).send({ value: "Casa habitación" });
    expect(res.status).toBe(200);
    expect(res.body.data.value).toBe("Casa habitación");
  });
});

describe("borrado en dos pasos", () => {
  it("la primera vez desactiva y la segunda borra", async () => {
    const admin = await auth("ADMIN");
    const row = await prisma.propertyType.create({ data: { name: "TEMPORAL", value: "Temporal" } });

    const first = await request(app).delete(`${BASE}/${row.id}`).set("Authorization", admin);
    expect(first.status).toBe(200);
    expect(first.body.data.deactivated).toBe(true);
    expect((await prisma.propertyType.findUniqueOrThrow({ where: { id: row.id } })).active).toBe(false);

    const second = await request(app).delete(`${BASE}/${row.id}`).set("Authorization", admin);
    expect(second.status).toBe(200);
    expect(await prisma.propertyType.findUnique({ where: { id: row.id } })).toBeNull();
  });

  it("un valor del sistema no se puede borrar (409)", async () => {
    const casa = await prisma.propertyType.findUniqueOrThrow({ where: { name: "CASA" } });
    const res = await request(app).delete(`${BASE}/${casa.id}`).set("Authorization", await auth("ADMIN"));
    expect(res.status).toBe(409);
  });

  it("un valor en uso no se borra (409) aunque esté inactivo", async () => {
    const admin = await auth("ADMIN");
    const type = await prisma.propertyType.create({ data: { name: "EN_USO", value: "En uso", active: false } });
    const status = await prisma.propertyStatus.findUniqueOrThrow({ where: { name: "VACNT" } });
    const kind = await prisma.propertyKind.findUniqueOrThrow({ where: { code: "HOUSE" } });
    const occupancy = await prisma.occupancyStatus.findUniqueOrThrow({ where: { code: "VACANT" } });
    await prisma.property.create({
      data: {
        identifier: `P-${Date.now()}`,
        name: "Casa",
        mainStreet: "Calle",
        statusId: status.id,
        typeId: type.id,
        kindId: kind.id,
        occupancyStatusId: occupancy.id,
      },
    });
    const res = await request(app).delete(`${BASE}/${type.id}`).set("Authorization", admin);
    expect(res.status).toBe(409);
    expect(res.body.messages[0]).toContain("en uso");
  });
});

describe("orden", () => {
  it("reordenar asigna el orden según la lista recibida", async () => {
    const admin = await auth("ADMIN");
    const [a, b] = await Promise.all([
      prisma.propertyType.findUniqueOrThrow({ where: { name: "CASA" } }),
      prisma.propertyType.findUniqueOrThrow({ where: { name: "DEPA" } }),
    ]);
    const res = await request(app).put(`${BASE}/reorder`).set("Authorization", admin).send({ ids: [b.id, a.id] });
    expect(res.status).toBe(200);
    expect((await prisma.propertyType.findUniqueOrThrow({ where: { id: b.id } })).order).toBe(0);
    expect((await prisma.propertyType.findUniqueOrThrow({ where: { id: a.id } })).order).toBe(1);
  });
});
