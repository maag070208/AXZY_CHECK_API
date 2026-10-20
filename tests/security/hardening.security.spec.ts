/**
 * [F9] Endurecimiento: asignación por token (S-03), perfil sin escalada de rol,
 * logout por token, sin hash de contraseña en respuestas (S-09), CORS (S-05)
 * y límite de tamaño de body (E-17).
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

describe("S-03 · assignedBy sale del token, no del body", () => {
  it("registra como asignador al usuario autenticado aunque el body diga otra cosa", async () => {
    const shift = await buildUser("SHIFT");
    const guard = await buildUser("GUARD");
    const impostor = await buildUser("ADMIN");
    const location = await prisma.location.create({
      data: { aisle: "A", spot: "1", number: "1", name: `Zona-${Date.now()}` },
    });

    const res = await request(app)
      .post("/api/v1/assignments")
      .set("Authorization", `Bearer ${tokenFor(shift)}`)
      .send({ guardId: guard.id, locationId: location.id, assignedBy: impostor.id, tasks: [] });

    expect(res.status).toBe(201);
    const row = await prisma.assignment.findFirstOrThrow({ where: { guardId: guard.id } });
    expect(row.assignedBy).toBe(shift.id);
    expect(row.assignedBy).not.toBe(impostor.id);
  });
});

describe("escalada de privilegios en el perfil", () => {
  it("un guardia NO puede cambiarse su propio rol a ADMIN", async () => {
    const guard = await buildUser("GUARD");
    const admin = await prisma.role.findUniqueOrThrow({ where: { name: "ADMIN" } });

    const res = await request(app)
      .put(`/api/v1/users/${guard.id}`)
      .set("Authorization", `Bearer ${tokenFor(guard)}`)
      .send({ name: "Nuevo", roleId: admin.id, role: "ADMIN" });

    expect(res.status).toBe(200);
    const after = await prisma.user.findUniqueOrThrow({ where: { id: guard.id }, include: { role: true } });
    expect(after.role.name).toBe("GUARD");
    expect(after.name).toBe("Nuevo");
  });

  it("un guardia NO puede editar el perfil de otro usuario", async () => {
    const guard = await buildUser("GUARD");
    const other = await buildUser("MAINT");
    const res = await request(app)
      .put(`/api/v1/users/${other.id}`)
      .set("Authorization", `Bearer ${tokenFor(guard)}`)
      .send({ name: "Hackeado" });
    expect(res.status).toBe(403);
  });

  it("un ADMIN sí puede cambiar el rol de otro usuario", async () => {
    const admin = await buildUser("ADMIN");
    const guard = await buildUser("GUARD");
    const maint = await prisma.role.findUniqueOrThrow({ where: { name: "MAINT" } });
    const res = await request(app)
      .put(`/api/v1/users/${guard.id}`)
      .set("Authorization", `Bearer ${tokenFor(admin)}`)
      .send({ roleId: maint.id });
    expect(res.status).toBe(200);
    const after = await prisma.user.findUniqueOrThrow({ where: { id: guard.id }, include: { role: true } });
    expect(after.role.name).toBe("MAINT");
  });
});

describe("logout usa solo la identidad del token", () => {
  it("cierra la sesión del que llama, nunca la de un id enviado en el body", async () => {
    const a = await buildUser("GUARD");
    const b = await buildUser("GUARD");
    await prisma.user.updateMany({ where: { id: { in: [a.id, b.id] } }, data: { isLoggedIn: true } });

    const res = await request(app)
      .post("/api/v1/users/logout")
      .set("Authorization", `Bearer ${tokenFor(a)}`)
      .send({ userId: b.id });

    expect(res.status).toBe(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: a.id } })).isLoggedIn).toBe(false);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: b.id } })).isLoggedIn).toBe(true);
  });
});

describe("S-09 · la respuesta de alta de usuario no contiene la contraseña", () => {
  it("POST /users devuelve el usuario sin el campo password", async () => {
    const admin = await buildUser("ADMIN");
    const role = await prisma.role.findUniqueOrThrow({ where: { name: "GUARD" } });
    const res = await request(app)
      .post("/api/v1/users")
      .set("Authorization", `Bearer ${tokenFor(admin)}`)
      .send({ name: "Nuevo", lastName: "Guardia", username: `nuevo_${Date.now()}`, password: "123456", roleId: role.id });

    expect(res.status).toBe(201);
    expect(res.body.data.username).toBeDefined();
    expect(res.body.data).not.toHaveProperty("password");
  });
});

describe("S-05 · CORS con lista de orígenes", () => {
  it("permite un origen de la lista", async () => {
    const res = await request(app).get("/api/v1/").set("Origin", "http://localhost:5002");
    expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:5002");
  });

  it("no devuelve cabecera de CORS para un origen ajeno", async () => {
    const res = await request(app).get("/api/v1/").set("Origin", "https://sitio-malicioso.example");
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });
});

describe("E-17 · límite de tamaño del body", () => {
  it("rechaza un body mayor a 1 MB con 413", async () => {
    const big = "a".repeat(1.5 * 1024 * 1024);
    const res = await request(app)
      .post("/api/v1/users/login")
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ username: big, password: "x" }));
    expect(res.status).toBe(413);
  });
});
