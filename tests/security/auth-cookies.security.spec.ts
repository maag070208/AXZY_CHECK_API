/**
 * Sesión WEB con cookies HttpOnly y refresh opaco rotatorio.
 */
import request from "supertest";
import { app } from "@src/app";
import { hashPassword } from "@src/core/utils/security";
import { resetDatabase, disconnectDatabase, prisma } from "../setup/db";
import { buildUser } from "../factories";

const PASSWORD = "Clave-Segura-2026";
const api = "/api/v1";

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await disconnectDatabase();
});

const makeUser = async () => {
  const user = await buildUser("ADMIN");
  await prisma.user.update({ where: { id: user.id }, data: { password: await hashPassword(PASSWORD) } });
  return user;
};

const login = async (agent: ReturnType<typeof request.agent>, username: string) =>
  agent.post(`${api}/users/login`).send({ username, password: PASSWORD });

describe("cookies de sesión", () => {
  it("login entrega cookies HttpOnly y permite /users/me sin Authorization", async () => {
    const user = await makeUser();
    const agent = request.agent(app);
    const response = await login(agent, user.username);

    expect(response.status).toBe(200);
    const cookies = String(response.headers["set-cookie"] ?? "");
    expect(cookies).toContain("checkapp_session=");
    expect(cookies).toContain("HttpOnly");
    expect(cookies).toContain("checkapp_refresh=");

    const me = await agent.get(`${api}/users/me`);
    expect(me.status).toBe(200);
    expect(me.body.data).toMatchObject({ id: user.id, username: user.username, role: "ADMIN" });
  });

  it("el refresh rota el token y no reutiliza el anterior", async () => {
    const user = await makeUser();
    const agent = request.agent(app);
    expect((await login(agent, user.username)).status).toBe(200);

    const first = await agent.post(`${api}/users/refresh`);
    expect(first.status).toBe(200);
    expect(String(first.headers["set-cookie"] ?? "")).toContain("checkapp_refresh=");

    const second = await agent.post(`${api}/users/refresh`);
    expect(second.status).toBe(200);

    const active = await prisma.refreshToken.count({ where: { userId: user.id, revokedAt: null } });
    expect(active).toBe(1);
  });

  it("logout revoca refresh y limpia cookies", async () => {
    const user = await makeUser();
    const agent = request.agent(app);
    expect((await login(agent, user.username)).status).toBe(200);
    expect((await agent.post(`${api}/users/logout`)).status).toBe(200);

    expect(await prisma.refreshToken.count({ where: { userId: user.id, revokedAt: null } })).toBe(0);
    const refresh = await agent.post(`${api}/users/refresh`);
    expect(refresh.status).toBe(401);
  });
});
