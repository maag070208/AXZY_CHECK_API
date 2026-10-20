/**
 * [S-09 · E-02/E1] Ninguna respuesta del API lleva la clave `password`, ni la
 * de un usuario ni la de un usuario anidado dentro de otro recurso.
 */
import request from "supertest";
import { app } from "@src/app";
import { redactSecrets } from "@src/core/middlewares/redact-secrets.middleware";
import { resetDatabase, disconnectDatabase, prisma } from "../setup/db";
import { buildUser, tokenFor } from "../factories";

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await disconnectDatabase();
});

describe("redactSecrets", () => {
  it("quita password en profundidad y conserva el resto", () => {
    const out = redactSecrets({ id: 1, password: "x", guard: { name: "A", password: "y" }, list: [{ password: "z", id: 2 }] });
    expect(out).toEqual({ id: 1, guard: { name: "A" }, list: [{ id: 2 }] });
  });

  it("no rompe fechas ni valores primitivos", () => {
    const d = new Date("2026-10-19T00:00:00Z");
    expect(redactSecrets({ at: d, n: 3, s: "ok", z: null })).toEqual({ at: d, n: 3, s: "ok", z: null });
  });
});

describe("respuestas del API sin hash de contraseña", () => {
  it("GET /users no devuelve el hash de ningún usuario", async () => {
    const admin = await buildUser("ADMIN");
    await buildUser("GUARD");
    const res = await request(app).get("/api/v1/users").set("Authorization", `Bearer ${tokenFor(admin)}`);
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain('"password"');
  });

  it("el listado de incidencias no incluye el usuario con su hash", async () => {
    const admin = await buildUser("ADMIN");
    const guard = await buildUser("GUARD");
    await prisma.incident.create({ data: { guardId: guard.id, title: "Prueba", kind: "INCIDENT" } });
    const res = await request(app).get("/api/v1/incidents").set("Authorization", `Bearer ${tokenFor(admin)}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(JSON.stringify(res.body)).not.toContain('"password"');
  });
});
