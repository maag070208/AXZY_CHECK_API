/**
 * [T-F0-02] Cada respuesta lleva X-Request-Id; se reutiliza el que envía el cliente
 * si es válido, y se genera uno si no.
 */
import request from "supertest";
import { app } from "@src/app";
import { disconnectDatabase } from "../setup/db";

afterAll(async () => {
  await disconnectDatabase();
});

describe("requestId", () => {
  it("genera un X-Request-Id cuando el cliente no envía uno", async () => {
    const res = await request(app).get("/health");
    expect(res.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("reutiliza el X-Request-Id válido que envía el cliente", async () => {
    const res = await request(app).get("/health").set("X-Request-Id", "app-123_ok");
    expect(res.headers["x-request-id"]).toBe("app-123_ok");
  });

  it("descarta un X-Request-Id con caracteres no permitidos", async () => {
    const res = await request(app).get("/health").set("X-Request-Id", "a b;<script>");
    expect(res.headers["x-request-id"]).not.toContain("<");
    expect(res.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("también aplica a respuestas de error", async () => {
    const res = await request(app).get("/api/v1/locations");
    expect(res.status).toBe(401);
    expect(res.headers["x-request-id"]).toBeDefined();
  });
});
