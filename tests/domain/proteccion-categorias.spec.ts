/**
 * Categorías de incidente del sistema: no se renombran ni se borran; sí se desactivan.
 * GET /properties exige properties.view.
 */
import request from "supertest";
import { app } from "@src/app";
import { resetDatabase, disconnectDatabase, prisma } from "../setup/db";
import { buildUser, tokenFor } from "../factories";

const BASE = "/api/v1/catalog-admin/categories";

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await disconnectDatabase();
});

const admin = async () => `Bearer ${tokenFor(await buildUser("ADMIN"))}`;

describe("categorías del sistema", () => {
  it("no se renombran (409 CATEGORY_SYSTEM)", async () => {
    const cat = await prisma.incidentCategory.create({ data: { name: "SEGURIDAD", value: "Seguridad", isSystem: true } });
    const res = await request(app).put(`${BASE}/${cat.id}`).set("Authorization", await admin()).send({ name: "OTRO" });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("CATEGORY_SYSTEM");
  });

  it("se desactivan, pero no se borran", async () => {
    const cat = await prisma.incidentCategory.create({ data: { name: "SERVICIOS", value: "Servicios", isSystem: true } });
    const token = await admin();
    const first = await request(app).delete(`${BASE}/${cat.id}`).set("Authorization", token);
    expect(first.body.data).toEqual(expect.objectContaining({ softDeleted: true }));
    const second = await request(app).delete(`${BASE}/${cat.id}`).set("Authorization", token);
    expect(second.status).toBe(409);
    expect(second.body.code).toBe("CATEGORY_SYSTEM");
    expect(await prisma.incidentCategory.count({ where: { id: cat.id } })).toBe(1);
  });

  it("una categoría no del sistema sí se puede renombrar", async () => {
    const cat = await prisma.incidentCategory.create({ data: { name: "PERSONAL", value: "Personal" } });
    const res = await request(app).put(`${BASE}/${cat.id}`).set("Authorization", await admin()).send({ name: "OTRO" });
    expect(res.status).toBe(200);
  });
});

describe("lectura de propiedades", () => {
  it("el guardia no lista propiedades; el jefe de turno sí", async () => {
    const guard = await request(app).get("/api/v1/properties").set("Authorization", `Bearer ${tokenFor(await buildUser("GUARD"))}`);
    expect(guard.status).toBe(403);
    const shift = await request(app).get("/api/v1/properties").set("Authorization", `Bearer ${tokenFor(await buildUser("SHIFT"))}`);
    expect(shift.status).toBe(200);
  });
});
