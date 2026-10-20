/**
 * [T-F0-05] Categorías y tipos de incidente como catálogos. Un tipo pertenece a
 * una categoría: sin categoría válida no se crea.
 */
import request from "supertest";
import { app } from "@src/app";
import { resetDatabase, disconnectDatabase, prisma } from "../setup/db";
import { buildUser, tokenFor } from "../factories";

const CATS = "/api/v1/catalogs/incident-categories";
const TYPES = "/api/v1/catalogs/incident-types";

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await disconnectDatabase();
});

const adminAuth = async () => `Bearer ${tokenFor(await buildUser("ADMIN"))}`;

describe("categorías de incidente", () => {
  it("CRUD básico: crear y listar", async () => {
    const token = await adminAuth();
    const created = await request(app).post(CATS).set("Authorization", token).send({ name: "EMERGENCIA", value: "Emergencia" });
    expect(created.status).toBe(201);
    const list = await request(app).get(CATS).set("Authorization", token);
    expect(list.body.data.map((r: any) => r.name)).toContain("EMERGENCIA");
  });
});

describe("tipos de incidente (hijos de una categoría)", () => {
  it("crear un tipo exige una categoría existente", async () => {
    const token = await adminAuth();
    const cat = await request(app).post(CATS).set("Authorization", token).send({ name: "SEGURIDAD", value: "Seguridad" });

    const ok = await request(app).post(TYPES).set("Authorization", token).send({ name: "ROBO", value: "Robo", categoryId: cat.body.data.id });
    expect(ok.status).toBe(201);
    expect(ok.body.data.categoryId).toBe(cat.body.data.id);

    const sinCategoria = await request(app).post(TYPES).set("Authorization", token).send({ name: "OTRO", value: "Otro" });
    expect(sinCategoria.status).toBe(400);
    expect(sinCategoria.body.code).toBe("VALIDATION_ERROR");

    const categoriaInexistente = await request(app).post(TYPES).set("Authorization", token).send({ name: "OTRO", value: "Otro", categoryId: 999999 });
    expect(categoriaInexistente.status).toBe(400);
  });

  it("el listado filtra por categoría", async () => {
    const token = await adminAuth();
    const a = await request(app).post(CATS).set("Authorization", token).send({ name: "A_CAT", value: "A" });
    const b = await request(app).post(CATS).set("Authorization", token).send({ name: "B_CAT", value: "B" });
    await request(app).post(TYPES).set("Authorization", token).send({ name: "T_A", value: "TA", categoryId: a.body.data.id });
    await request(app).post(TYPES).set("Authorization", token).send({ name: "T_B", value: "TB", categoryId: b.body.data.id });

    const res = await request(app).get(`${TYPES}?categoryId=${a.body.data.id}`).set("Authorization", token);
    expect(res.body.data.map((r: any) => r.name)).toEqual(["T_A"]);
  });

  it("los valores del sistema no se pueden borrar", async () => {
    const system = await prisma.incidentCategory.create({ data: { name: "SISTEMA_X", value: "Sistema", isSystem: true } });
    const res = await request(app).delete(`${CATS}/${system.id}`).set("Authorization", await adminAuth());
    expect(res.status).toBe(409);
  });
});
