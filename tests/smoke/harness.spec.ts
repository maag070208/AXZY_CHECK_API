import request from "supertest";
import { app } from "@src/app";
import { assertSafeTestDatabase, TEST_DATABASE_URL_DEFAULT } from "../setup/safety";
import { resetDatabase, disconnectDatabase, prisma } from "../setup/db";
import { buildUser, tokenFor } from "../factories";

describe("harness de pruebas", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await disconnectDatabase();
  });

  it("usa una base de prueba segura", () => {
    expect(process.env.DATABASE_URL).toBe(TEST_DATABASE_URL_DEFAULT);
    expect(() => assertSafeTestDatabase(process.env.DATABASE_URL as string)).not.toThrow();
  });

  it("siembra el catálogo base de roles", async () => {
    const names = (await prisma.role.findMany({ select: { name: true } })).map((r) => r.name).sort();
    expect(names).toEqual(expect.arrayContaining(["ADMIN", "GUARD", "MAINT", "SHIFT"]));
  });

  it("aísla datos entre pruebas", async () => {
    await buildUser("GUARD");
    expect(await prisma.user.count()).toBe(1);
  });

  it("responde la ruta de salud con la app real (sin levantar servidor)", async () => {
    const res = await request(app).get("/api/v1/");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("acepta un token emitido por la fábrica", async () => {
    const user = await buildUser("ADMIN");
    const token = tokenFor(user);
    const { verifyToken } = await import("@src/core/utils/security");
    const payload: any = await verifyToken(token);
    expect(payload.role).toBe("ADMIN");
    expect(payload.id).toBe(user.id);
  });
});
