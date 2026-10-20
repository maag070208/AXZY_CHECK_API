/**
 * [F9] Límite de subidas por IP. Límite bajo fijado para esta prueba.
 * Las peticiones no llevan archivo: la respuesta 400 no toca S3.
 */
process.env.RATE_LIMIT_UPLOAD_MAX = "2";

import request from "supertest";
import { app } from "@src/app";
import { resetDatabase, disconnectDatabase } from "../setup/db";
import { buildUser, tokenFor } from "../factories";

afterAll(async () => {
  await disconnectDatabase();
});

describe("límite de subidas", () => {
  it("responde 429 tras superar el máximo de subidas por minuto", async () => {
    await resetDatabase();
    const guard = await buildUser("GUARD");
    const statuses: number[] = [];
    for (let i = 0; i < 3; i++) {
      const res = await request(app)
        .post("/api/v1/uploads")
        .set("Authorization", `Bearer ${tokenFor(guard)}`);
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 2)).toEqual([400, 400]);
    expect(statuses[2]).toBe(429);
  });
});
