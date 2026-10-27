/**
 * Auditoría S-25 y S-26: política de contraseñas, bloqueo por cuenta, revocación de sesión,
 * cuenta desactivada y algoritmo de firma fijo.
 */
import jwt from "jsonwebtoken";
import request from "supertest";
import { app } from "@src/app";
import { hashPassword } from "@src/core/utils/security";
import { strongPassword } from "@src/core/validation/password";
import { resetDatabase, disconnectDatabase, prisma } from "../setup/db";
import { buildUser } from "../factories";

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await disconnectDatabase();
});

const PASSWORD = "Clave-Segura-2026";

/** Usuario ADMIN con contraseña real (la fábrica usa un texto que no es hash). */
const makeLoginUser = async () => {
  const user = await buildUser("ADMIN");
  await prisma.user.update({ where: { id: user.id }, data: { password: await hashPassword(PASSWORD) } });
  return user;
};

const login = (username: string, password: string) => request(app).post("/api/v1/users/login").send({ username, password });

describe("política de contraseñas", () => {
  it.each([
    ["corta", "Ab1"],
    ["sin número", "SoloLetrasLargas"],
    ["sin letra", "12345678901"],
    ["común", "password123"],
  ])("rechaza una contraseña %s", (_label, value) => {
    expect(strongPassword.safeParse(value).success).toBe(false);
  });

  it("acepta una contraseña larga con letras y números", () => {
    expect(strongPassword.safeParse(PASSWORD).success).toBe(true);
  });
});

describe("bloqueo por cuenta", () => {
  it("bloquea tras 5 intentos fallidos y responde 429 aunque la clave sea correcta", async () => {
    const user = await makeLoginUser();
    for (let i = 0; i < 5; i += 1) {
      expect((await login(user.username, "incorrecta-123")).status).toBe(401);
    }
    const blocked = await login(user.username, PASSWORD);
    expect(blocked.status).toBe(429);
  });

  it("al vencer el bloqueo permite entrar y reinicia el contador", async () => {
    const user = await makeLoginUser();
    await prisma.user.update({ where: { id: user.id }, data: { failedLoginCount: 3, lockedUntil: new Date(Date.now() - 1000) } });
    const ok = await login(user.username, PASSWORD);
    expect(ok.status).toBe(200);
    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(row.failedLoginCount).toBe(0);
    expect(row.lockedUntil).toBeNull();
  });
});

describe("revocación de sesión", () => {
  it("el cierre de sesión invalida el token", async () => {
    const user = await makeLoginUser();
    const token = (await login(user.username, PASSWORD)).body.data;
    const auth = { Authorization: `Bearer ${token}` };

    expect((await request(app).get("/api/v1/users/me/permissions").set(auth)).status).toBe(200);
    expect((await request(app).post("/api/v1/users/logout").set(auth)).status).toBe(200);
    expect((await request(app).get("/api/v1/users/me/permissions").set(auth)).status).toBe(401);
  });

  it("cambiar la contraseña revoca el token anterior y entrega uno nuevo que sí funciona", async () => {
    const user = await makeLoginUser();
    const oldToken = (await login(user.username, PASSWORD)).body.data;

    const changed = await request(app)
      .put(`/api/v1/users/${user.id}/password`)
      .set({ Authorization: `Bearer ${oldToken}` })
      .send({ oldPassword: PASSWORD, newPassword: "Otra-Clave-2027" });
    expect(changed.status).toBe(200);
    const newToken = changed.body.data.token;
    expect(typeof newToken).toBe("string");

    expect((await request(app).get("/api/v1/users/me/permissions").set({ Authorization: `Bearer ${oldToken}` })).status).toBe(401);
    expect((await request(app).get("/api/v1/users/me/permissions").set({ Authorization: `Bearer ${newToken}` })).status).toBe(200);
  });

  it("una contraseña nueva débil se rechaza con 400", async () => {
    const user = await makeLoginUser();
    const token = (await login(user.username, PASSWORD)).body.data;
    const res = await request(app)
      .put(`/api/v1/users/${user.id}/password`)
      .set({ Authorization: `Bearer ${token}` })
      .send({ oldPassword: PASSWORD, newPassword: "123456" });
    expect(res.status).toBe(400);
  });

  it("desactivar la cuenta corta el acceso con el token vigente", async () => {
    const user = await makeLoginUser();
    const token = (await login(user.username, PASSWORD)).body.data;
    await prisma.user.update({ where: { id: user.id }, data: { active: false } });
    expect((await request(app).get("/api/v1/users/me/permissions").set({ Authorization: `Bearer ${token}` })).status).toBe(401);
  });
});

describe("firma del token", () => {
  it("rechaza un token con algoritmo none", async () => {
    const user = await makeLoginUser();
    const unsigned = jwt.sign({ id: user.id, role: "ADMIN", username: user.username }, "", { algorithm: "none" });
    expect((await request(app).get("/api/v1/users/me/permissions").set({ Authorization: `Bearer ${unsigned}` })).status).toBe(401);
  });
});
