/**
 * [T-F0-12] Bitácora: cada cambio de catálogo deja un registro con quién lo hizo,
 * qué había antes y qué quedó después, y el borrado en dos pasos queda registrado.
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

const adminAuth = async () => {
  const admin = await buildUser("ADMIN");
  return { admin, token: `Bearer ${tokenFor(admin)}` };
};

describe("catálogos", () => {
  it("crear un valor registra action, actor y el valor creado", async () => {
    const { admin, token } = await adminAuth();
    const res = await request(app).post(BASE).set("Authorization", token).send({ name: "LOFT", value: "Loft" });
    expect(res.status).toBe(201);

    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: "property-types.create" } });
    expect(log).toMatchObject({ actorId: admin.id, entity: "property-types", entityId: String(res.body.data.id), before: null });
    expect(log.after).toMatchObject({ name: "LOFT", value: "Loft" });
  });

  it("actualizar guarda el estado anterior y el nuevo", async () => {
    const { token } = await adminAuth();
    const created = await request(app).post(BASE).set("Authorization", token).send({ name: "LOFT", value: "Loft" });

    await request(app).put(`${BASE}/${created.body.data.id}`).set("Authorization", token).send({ value: "Loft (nuevo)" });

    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: "property-types.update" } });
    expect(log.before).toMatchObject({ value: "Loft" });
    expect(log.after).toMatchObject({ value: "Loft (nuevo)" });
  });

  it("el borrado en dos pasos deja un registro de desactivación y otro de borrado", async () => {
    const { token } = await adminAuth();
    const created = await request(app).post(BASE).set("Authorization", token).send({ name: "LOFT", value: "Loft" });
    const id = created.body.data.id;

    await request(app).delete(`${BASE}/${id}`).set("Authorization", token);
    await request(app).delete(`${BASE}/${id}`).set("Authorization", token);

    const actions = (await prisma.auditLog.findMany({ where: { entityId: String(id) }, orderBy: { id: "asc" } })).map((l) => l.action);
    expect(actions).toEqual(["property-types.create", "property-types.deactivate", "property-types.delete"]);
  });

  it("reordenar deja un registro con el nuevo orden", async () => {
    const { token } = await adminAuth();
    const list = await request(app).get(`${BASE}?all=true`).set("Authorization", token);
    const ids = list.body.data.map((r: any) => r.id).reverse();

    const res = await request(app).put(`${BASE}/reorder`).set("Authorization", token).send({ ids });
    expect(res.status).toBe(200);

    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: "property-types.reorder" } });
    expect(log.after).toEqual({ ids });
  });

  it("un cambio rechazado por ser de sistema no deja registro", async () => {
    const { token } = await adminAuth();
    const system = await prisma.propertyType.findFirstOrThrow({ where: { isSystem: true } });

    const res = await request(app).put(`${BASE}/${system.id}`).set("Authorization", token).send({ name: "OTRO_CODIGO" });
    expect(res.status).toBe(409);
    expect(await prisma.auditLog.count()).toBe(0);
  });
});
