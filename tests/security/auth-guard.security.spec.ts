/**
 * [F9 · T-F9-T1] Guard global: toda ruta fuera de la lista blanca responde 401
 * sin token. Recorre el router real, así que una ruta nueva sin protección
 * hace fallar esta prueba sin que nadie tenga que acordarse.
 */
import request from "supertest";
import { app } from "@src/app";
import { isPublicRoute } from "@src/core/routes/public";
import { listRoutes } from "./route-inventory";
import { disconnectDatabase } from "../setup/db";

afterAll(async () => {
  await disconnectDatabase();
});

const API_PREFIX = "/api/v1";
// El guard vive en apiRouter: compara contra la ruta RELATIVA a /api/v1.
const relative = (path: string) => path.slice(API_PREFIX.length) || "/";

const routes = listRoutes(app);
const apiRoutes = routes.filter((r) => r.path.startsWith(API_PREFIX));
const protectedRoutes = apiRoutes.filter((r) => !isPublicRoute(r.method, relative(r.path)));

describe("guard global de autenticación", () => {
  it.each(protectedRoutes.map((r) => [r.method.toUpperCase(), r.path]))(
    "%s %s responde 401 sin token",
    async (method, path) => {
      const res = await (request(app) as any)[method.toLowerCase()](path).send({});
      expect(res.status).toBe(401);
    },
  );

  it("una ruta inexistente también exige token (falla cerrado, no revela qué existe)", async () => {
    const res = await request(app).get("/api/v1/no-existe-esta-ruta");
    expect(res.status).toBe(401);
  });

  it("rechaza un token con firma inválida", async () => {
    const res = await request(app)
      .get("/api/v1/locations")
      .set("Authorization", "Bearer token.falso.aqui");
    expect(res.status).toBe(401);
  });

  it("la lista pública es exactamente la declarada (health y login)", () => {
    expect(isPublicRoute("GET", "/")).toBe(true);
    expect(isPublicRoute("POST", "/users/login")).toBe(true);
    expect(isPublicRoute("GET", "/users/login")).toBe(false);
    expect(isPublicRoute("POST", "/users/logout")).toBe(false);
  });

  it("el inventario cubre el router completo", () => {
    expect(apiRoutes.length).toBeGreaterThanOrEqual(120);
  });

  it("las únicas rutas públicas del API son las declaradas", () => {
    const publicOnes = apiRoutes
      .filter((r) => isPublicRoute(r.method, relative(r.path)))
      .map((r) => `${r.method.toUpperCase()} ${relative(r.path)}`)
      .sort();
    expect(publicOnes).toEqual(["GET /", "POST /users/login"]);
  });
});
