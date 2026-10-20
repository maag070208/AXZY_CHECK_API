/**
 * [T-F0-03] Validación de entrada con Zod: 400 con la lista de campos
 * inválidos. Los permisos se evalúan antes que la validación (403 antes que 400).
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

describe("login", () => {
  it("sin contraseña responde 400 indicando el campo", async () => {
    const res = await request(app).post("/api/v1/users/login").send({ username: "alguien" });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
    expect(res.body.issues.map((i: any) => i.path)).toContain("body.password");
  });
});

describe("alta de usuario", () => {
  it("contraseña corta responde 400", async () => {
    const admin = await buildUser("ADMIN");
    const role = await prisma.role.findUniqueOrThrow({ where: { name: "GUARD" } });
    const res = await request(app)
      .post("/api/v1/users")
      .set("Authorization", `Bearer ${tokenFor(admin)}`)
      .send({ name: "Ana", username: "ana_guardia", password: "123", roleId: role.id });
    expect(res.status).toBe(400);
    expect(res.body.issues.map((i: any) => i.path)).toContain("body.password");
  });

  it("sin rol responde 400", async () => {
    const admin = await buildUser("ADMIN");
    const res = await request(app)
      .post("/api/v1/users")
      .set("Authorization", `Bearer ${tokenFor(admin)}`)
      .send({ name: "Ana", username: "ana_guardia", password: "123456" });
    expect(res.status).toBe(400);
  });

  it("un guardia sin permiso recibe 403, no 400 (el permiso va primero)", async () => {
    const guard = await buildUser("GUARD");
    const res = await request(app)
      .post("/api/v1/users")
      .set("Authorization", `Bearer ${tokenFor(guard)}`)
      .send({});
    expect(res.status).toBe(403);
  });
});

describe("rutas de recorrido", () => {
  it("sin puntos responde 400", async () => {
    const shift = await buildUser("SHIFT");
    const res = await request(app)
      .post("/api/v1/recurring")
      .set("Authorization", `Bearer ${tokenFor(shift)}`)
      .send({ title: "Ronda", locations: [] });
    expect(res.status).toBe(400);
    expect(res.body.issues.map((i: any) => i.path)).toContain("body.locations");
  });

  it("un id de punto no numérico responde 400", async () => {
    const shift = await buildUser("SHIFT");
    const res = await request(app)
      .post("/api/v1/recurring")
      .set("Authorization", `Bearer ${tokenFor(shift)}`)
      .send({ title: "Ronda", locations: [{ locationId: "abc" }] });
    expect(res.status).toBe(400);
  });
});

describe("reportes", () => {
  it("una incidencia sin título responde 400", async () => {
    const guard = await buildUser("GUARD");
    const res = await request(app)
      .post("/api/v1/incidents")
      .set("Authorization", `Bearer ${tokenFor(guard)}`)
      .send({ description: "sin título" });
    expect(res.status).toBe(400);
    expect(res.body.issues.map((i: any) => i.path)).toContain("body.title");
  });

  it("una latitud fuera de rango responde 400", async () => {
    const guard = await buildUser("GUARD");
    const res = await request(app)
      .post("/api/v1/incidents")
      .set("Authorization", `Bearer ${tokenFor(guard)}`)
      .send({ title: "Fuga", latitude: 200 });
    expect(res.status).toBe(400);
  });
});
