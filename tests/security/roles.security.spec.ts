/**
 * [F9 · T-F9-T2 y T-F9-T4] Control de roles en las escrituras sensibles.
 * Para roles permitidos la prueba solo exige que NO sea 401/403 (el cuerpo es
 * intencionalmente mínimo; lo que importa es que la autorización pase).
 */
import request from "supertest";
import { app } from "@src/app";
import { resetDatabase, disconnectDatabase, prisma } from "../setup/db";
import { buildUser, tokenFor, RoleName } from "../factories";

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await disconnectDatabase();
});

const session = async (role: RoleName) => {
  const user = await buildUser(role);
  return { user, token: tokenFor(user) };
};

type Case = { method: "post" | "put" | "patch" | "delete"; path: string; allowed: RoleName[]; forbidden: RoleName[] };

const CASES: Case[] = [
  // Usuarios: solo ADMIN gestiona cuentas ajenas.
  { method: "post", path: "/api/v1/users", allowed: ["ADMIN"], forbidden: ["SHIFT", "GUARD", "MAINT", "RESDN"] },
  { method: "delete", path: "/api/v1/users/999", allowed: ["ADMIN"], forbidden: ["SHIFT", "GUARD", "MAINT", "RESDN"] },
  { method: "put", path: "/api/v1/users/999/reset-password", allowed: ["ADMIN"], forbidden: ["SHIFT", "GUARD", "MAINT", "RESDN"] },
  // Rutas: gestión solo ADMIN y SHIFT.
  { method: "post", path: "/api/v1/recurring", allowed: ["ADMIN", "SHIFT"], forbidden: ["GUARD", "MAINT", "RESDN"] },
  { method: "delete", path: "/api/v1/recurring/999", allowed: ["ADMIN", "SHIFT"], forbidden: ["GUARD", "MAINT", "RESDN"] },
  { method: "post", path: "/api/v1/recurring/999/assign", allowed: ["ADMIN", "SHIFT"], forbidden: ["GUARD", "MAINT", "RESDN"] },
  // Asignaciones: crear y cambiar estado solo ADMIN y SHIFT.
  { method: "post", path: "/api/v1/assignments", allowed: ["ADMIN", "SHIFT"], forbidden: ["GUARD", "MAINT", "RESDN"] },
  { method: "patch", path: "/api/v1/assignments/999/status", allowed: ["ADMIN", "SHIFT"], forbidden: ["GUARD", "MAINT", "RESDN"] },
  // Catálogos de planta.
  { method: "post", path: "/api/v1/schedules", allowed: ["ADMIN"], forbidden: ["SHIFT", "GUARD", "MAINT", "RESDN"] },
  { method: "post", path: "/api/v1/locations", allowed: ["ADMIN", "SHIFT"], forbidden: ["GUARD", "MAINT", "RESDN"] },
  { method: "post", path: "/api/v1/properties", allowed: ["ADMIN"], forbidden: ["SHIFT", "GUARD", "MAINT", "RESDN"] },
  { method: "post", path: "/api/v1/residents", allowed: ["ADMIN"], forbidden: ["SHIFT", "GUARD", "MAINT", "RESDN"] },
  // Reportes: cada tipo lo resuelve su responsable.
  { method: "put", path: "/api/v1/incidents/999/resolve", allowed: ["ADMIN", "SHIFT"], forbidden: ["GUARD", "MAINT", "RESDN"] },
  { method: "put", path: "/api/v1/maintenance/999/resolve", allowed: ["ADMIN", "MAINT"], forbidden: ["SHIFT", "GUARD", "RESDN"] },
  { method: "delete", path: "/api/v1/kardex/999", allowed: ["ADMIN", "SHIFT"], forbidden: ["GUARD", "MAINT", "RESDN"] },
];

describe("control de roles en escrituras sensibles", () => {
  for (const c of CASES) {
    describe(`${c.method.toUpperCase()} ${c.path}`, () => {
      it.each(c.forbidden)("rol %s recibe 403", async (role) => {
        const { token } = await session(role);
        const res = await (request(app) as any)[c.method](c.path).set("Authorization", `Bearer ${token}`).send({});
        expect(res.status).toBe(403);
        expect(res.body.success).toBe(false);
      });

      it.each(c.allowed)("rol %s no es bloqueado por el rol (no 401/403)", async (role) => {
        const { token } = await session(role);
        const res = await (request(app) as any)[c.method](c.path).set("Authorization", `Bearer ${token}`).send({});
        expect([401, 403]).not.toContain(res.status);
      });
    });
  }

  it("un guardia no puede pedir el listado de todos los usuarios", async () => {
    const { token } = await session("GUARD");
    const res = await request(app).get("/api/v1/users").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it("un residente no puede ver el catálogo de administración", async () => {
    const { token } = await session("RESDN");
    const res = await request(app).get("/api/v1/catalog-admin/categories").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it("la lista de personal de un guardia solo es visible para ADMIN y SHIFT (no se filtra)", async () => {
    const { token } = await session("MAINT");
    const res = await request(app).post("/api/v1/users/datatable").set("Authorization", `Bearer ${token}`).send({});
    expect(res.status).toBe(403);
  });
});
