/**
 * [T-F0-03] Toda ruta de escritura (POST/PUT/PATCH) valida su entrada con Zod,
 * salvo las excepciones de abajo, cada una con su motivo. Una ruta nueva sin
 * validate() hace fallar esta prueba.
 */
import { app } from "@src/app";
import { listRoutes } from "./route-inventory";
import { disconnectDatabase } from "../setup/db";

afterAll(async () => {
  await disconnectDatabase();
});

/** Escrituras que no reciben cuerpo que validar, con el motivo. */
const EXEMPT: Record<string, string> = {
  "POST /api/v1/users/logout": "sin cuerpo: la identidad viene del token",
  "POST /api/v1/uploads/": "multipart: tipo y tamaño los valida multer",
  "PUT /api/v1/club/:id/resolve": "sin cuerpo",
  "PUT /api/v1/incidents/:id/resolve": "sin cuerpo",
  "PUT /api/v1/maintenance/:id/resolve": "sin cuerpo",
  "PUT /api/v1/rounds/:id/end": "sin cuerpo",
  "PATCH /api/v1/assignments/tasks/:taskId/toggle": "sin cuerpo",
  "PUT /api/v1/catalog-admin/categories/:id/pin": "sin cuerpo",
  "PUT /api/v1/catalog-admin/types/:id/pin": "sin cuerpo",
};

/** Consultas de tabla (POST /.../datatable): leen con filtros, no escriben. */
const isDatatableRead = (key: string) => key.endsWith("/datatable");

describe("cobertura de validación Zod en escrituras", () => {
  const writes = listRoutes(app).filter((r) => ["post", "put", "patch"].includes(r.method));

  it("hay rutas de escritura que inspeccionar", () => {
    expect(writes.length).toBeGreaterThan(40);
  });

  it("toda escritura valida su entrada o está en la lista de excepciones", () => {
    const sinValidar = writes
      .filter((r) => !r.validated)
      .map((r) => `${r.method.toUpperCase()} ${r.pattern}`)
      .filter((key) => !(key in EXEMPT) && !isDatatableRead(key));
    expect(sinValidar).toEqual([]);
  });

  it("las excepciones siguen existiendo (no quedan entradas muertas)", () => {
    const keys = new Set(writes.map((r) => `${r.method.toUpperCase()} ${r.pattern}`));
    const muertas = Object.keys(EXEMPT).filter((key) => !keys.has(key));
    expect(muertas).toEqual([]);
  });
});
