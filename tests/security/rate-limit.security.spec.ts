/**
 * [F9 · T-F9-T4] Límite de intentos de login (S-10 / fuerza bruta).
 * Se fija un límite bajo para esta prueba. Va en su propio archivo porque el
 * límite vive en memoria por módulo.
 */
process.env.RATE_LIMIT_LOGIN_MAX = "3";

import request from "supertest";
import { app } from "@src/app";
import { resetDatabase, disconnectDatabase } from "../setup/db";
import { buildUser } from "../factories";

beforeEach(async () => {
  await resetDatabase();
  await buildUser("ADMIN", { username: "limite_admin" });
});

afterAll(async () => {
  await disconnectDatabase();
});

describe("límite de intentos de login", () => {
  it("responde 429 tras superar el máximo de intentos por minuto", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 4; i++) {
      const res = await request(app)
        .post("/api/v1/users/login")
        .send({ username: "limite_admin", password: "incorrecta" });
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 3)).toEqual([401, 401, 401]);
    expect(statuses[3]).toBe(429);
  });
});
