/**
 * [E-19 · T-F0-T8] El manejador global no filtra detalles internos.
 */
import express from "express";
import request from "supertest";
import { AppError } from "@src/core/errors/app-error";
import { errorHandler } from "@src/core/middlewares/error-handler.middleware";

const build = (thrower: (next: any) => void) => {
  const app = express();
  app.get("/x", (_req, _res, next) => thrower(next));
  app.use(errorHandler);
  return app;
};

describe("manejador global de errores", () => {
  it("un AppError responde su status, su mensaje y su código", async () => {
    const res = await request(build((next) => next(new AppError("ROUND_ALREADY_ACTIVE", "Ya tienes una ronda activa", 409))))
      .get("/x");
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("ROUND_ALREADY_ACTIVE");
    expect(res.body.messages).toEqual(["Ya tienes una ronda activa"]);
    expect(res.body.success).toBe(false);
  });

  it("un error inesperado responde 500 genérico, sin mensaje ni stack internos", async () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    const res = await request(build(() => { throw new Error("secreto de la base: password=abc"); })).get("/x");
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain("secreto");
    expect(res.body.messages).toEqual(["Error interno del servidor"]);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("un error 4xx de terceros conserva su status y su mensaje", async () => {
    const res = await request(build((next) => {
      const err: any = new Error("request entity too large");
      err.status = 413;
      next(err);
    })).get("/x");
    expect(res.status).toBe(413);
    expect(res.body.messages).toEqual(["request entity too large"]);
  });
});
