import { app } from "@src/app";
import { listRoutes } from "./route-inventory";
import { disconnectDatabase } from "../setup/db";

afterAll(async () => {
  await disconnectDatabase();
});

describe("inventario de rutas", () => {
  it("encuentra las rutas del API (si no, las pruebas de seguridad pasarían en vacío)", () => {
    const routes = listRoutes(app);
    expect(routes.length).toBeGreaterThan(80);
    const patterns = routes.map((r) => `${r.method.toUpperCase()} ${r.pattern}`);
    expect(patterns).toEqual(
      expect.arrayContaining([
        "GET /api/v1/",
        "POST /api/v1/users/login",
        "POST /api/v1/users/logout",
        "GET /api/v1/locations/",
        "DELETE /api/v1/users/:id",
        "PUT /api/v1/users/:id",
      ]),
    );
  });
});
