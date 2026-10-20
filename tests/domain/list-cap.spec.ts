/**
 * [E-01 · E1] Los listados sin paginación devuelven como máximo LIST_MAX_ROWS.
 */
import request from "supertest";
import { app } from "@src/app";
import { LIST_MAX_ROWS } from "@src/core/constants/limits";
import { resetDatabase, disconnectDatabase, prisma } from "../setup/db";
import { buildUser, tokenFor } from "../factories";

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await disconnectDatabase();
});

describe("tope de filas en listados", () => {
  it("GET /incidents devuelve como máximo LIST_MAX_ROWS aunque haya más", async () => {
    const admin = await buildUser("ADMIN");
    const guard = await buildUser("GUARD");
    const total = LIST_MAX_ROWS + 5;
    await prisma.incident.createMany({
      data: Array.from({ length: total }, (_, i) => ({ guardId: guard.id, title: `R-${i}`, kind: "INCIDENT" })),
    });
    const res = await request(app).get("/api/v1/incidents").set("Authorization", `Bearer ${tokenFor(admin)}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(LIST_MAX_ROWS);
  });

  it("GET /kardex devuelve como máximo LIST_MAX_ROWS", async () => {
    const admin = await buildUser("ADMIN");
    const guard = await buildUser("GUARD");
    const location = await prisma.location.create({ data: { aisle: "A", spot: "1", number: "1", name: `K-${Date.now()}` } });
    const total = LIST_MAX_ROWS + 5;
    await prisma.kardex.createMany({
      data: Array.from({ length: total }, () => ({ userId: guard.id, locationId: location.id, notes: "ok" })),
    });
    const res = await request(app).get("/api/v1/kardex").set("Authorization", `Bearer ${tokenFor(admin)}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(LIST_MAX_ROWS);
  });
});
