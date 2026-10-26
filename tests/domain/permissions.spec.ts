/**
 * [T-F0-07] Permisos por rol: la matriz sembrada, la consulta por petición
 * (una revocación surte efecto sin reiniciar sesión) y el dueño-o-permiso.
 */
import request from "supertest";
import { app } from "@src/app";
import { roleHasPermission } from "@src/core/permissions/permissions.service";
import { ROLE_PERMISSIONS } from "@src/core/permissions/permission-matrix";
import { resetDatabase, disconnectDatabase, prisma } from "../setup/db";
import { buildUser, tokenFor } from "../factories";

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await disconnectDatabase();
});

describe("matriz sembrada", () => {
  it("ADMIN tiene todos los permisos de administración", async () => {
    const count = await prisma.rolePermission.count({ where: { role: { name: "ADMIN" } } });
    expect(count).toBe(ROLE_PERMISSIONS.ADMIN.length);
  });

  it("GUARD tiene consulta de caseta, chat y rutas operativas", async () => {
    const codes = (await prisma.rolePermission.findMany({
      where: { role: { name: "GUARD" } },
      include: { permission: true },
    })).map((rp) => rp.permission.code).sort();
    expect(codes).toEqual([
      "access.check",
      "accesspin.validate",
      "assignment.view",
      "chat.use",
      "club.create",
      "club.view",
      "incident.create",
      "incident.view",
      "maintenance.create",
      "maintenance.view",
      "recurring.operate",
      "round.end",
      "round.scan",
      "round.start",
      "round.view",
    ]);
  });

  it("RESDN no tiene ningún permiso", async () => {
    expect(await roleHasPermission("RESDN", "chat.use")).toBe(false);
  });
});

describe("consulta por petición", () => {
  it("revocar un permiso en la base surte efecto en la siguiente petición", async () => {
    const shift = await buildUser("SHIFT");
    const token = `Bearer ${tokenFor(shift)}`;
    const body = { page: 1, limit: 10, filters: {} };

    expect((await request(app).post("/api/v1/users/datatable").set("Authorization", token).send(body)).status).toBe(200);

    const role = await prisma.role.findUniqueOrThrow({ where: { name: "SHIFT" } });
    const perm = await prisma.permission.findUniqueOrThrow({ where: { code: "users.read" } });
    await prisma.rolePermission.delete({ where: { roleId_permissionId: { roleId: role.id, permissionId: perm.id } } });

    expect((await request(app).post("/api/v1/users/datatable").set("Authorization", token).send(body)).status).toBe(403);
  });

  it("un rol sin el permiso recibe 403 con el mensaje estándar", async () => {
    const guard = await buildUser("GUARD");
    const res = await request(app)
      .post("/api/v1/users/datatable")
      .set("Authorization", `Bearer ${tokenFor(guard)}`)
      .send({ page: 1, limit: 10, filters: {} });
    expect(res.status).toBe(403);
    expect(res.body.messages).toEqual(["No tienes permisos para realizar esta acción"]);
  });
});

describe("dueño o permiso (selfOrPermission)", () => {
  it("un usuario puede cambiar su propia contraseña sin permiso de administración", async () => {
    const guard = await buildUser("GUARD");
    const res = await request(app)
      .put(`/api/v1/users/${guard.id}/password`)
      .set("Authorization", `Bearer ${tokenFor(guard)}`)
      .send({ oldPassword: "x", newPassword: "y" });
    expect(res.status).not.toBe(403);
  });

  it("un usuario no puede cambiar la contraseña de otro sin permiso", async () => {
    const guard = await buildUser("GUARD");
    const other = await buildUser("GUARD");
    const res = await request(app)
      .put(`/api/v1/users/${other.id}/password`)
      .set("Authorization", `Bearer ${tokenFor(guard)}`)
      .send({ oldPassword: "x", newPassword: "y" });
    expect(res.status).toBe(403);
  });
});
