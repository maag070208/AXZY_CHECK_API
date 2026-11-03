/**
 * Multicliente, fase 1: `authenticate` arma `req.scope` desde la sesión (organización, asignación
 * activa, propiedad) y valida X-Client-Id contra la base. Se prueba con una ruta mínima que devuelve
 * el alcance, sin depender de ningún módulo.
 */
import express from "express";
import request from "supertest";
import { authenticate } from "@src/modules/common/middlewares/auth.middleware";
import { resetDatabase, disconnectDatabase, prisma } from "../setup/db";
import { assignGuard, buildOrganization, buildUser, tokenFor } from "../factories";

const probe = express();
probe.get("/scope", authenticate, (req, res) => res.json(req.scope));

const scopeOf = (user: Parameters<typeof tokenFor>[0], clientHeader?: string) => {
  const req = request(probe).get("/scope").set("Authorization", `Bearer ${tokenFor(user)}`);
  return clientHeader === undefined ? req : req.set("X-Client-Id", clientHeader);
};

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await disconnectDatabase();
});

describe("authenticate · req.scope", () => {
  it("organización sin clientes: alcance sin cliente, sin error", async () => {
    const { organization } = await buildOrganization("DIRECT", 0);
    const admin = await buildUser("ADMIN", { scope: { organizationId: organization.id, clientId: null } });
    const res = await scopeOf(admin);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ organizationId: organization.id, clientId: null });
  });

  it("guardia: el cliente de su asignación activa; sin asignación, ninguno", async () => {
    const { organization, clients } = await buildOrganization("COMPANY", 2);
    const guard = await buildUser("GUARD", { scope: { organizationId: organization.id, clientId: null } });

    expect((await scopeOf(guard)).body).toEqual({ organizationId: organization.id, clientId: null });

    await assignGuard(guard.id, clients[1].id);
    expect((await scopeOf(guard)).body).toEqual({ organizationId: organization.id, clientId: clients[1].id });
  });

  it("guardia: al cerrar su asignación y abrir otra, ve solo el cliente nuevo", async () => {
    const { organization, clients } = await buildOrganization("COMPANY", 2);
    const guard = await buildUser("GUARD", { scope: { organizationId: organization.id, clientId: null } });
    const first = await assignGuard(guard.id, clients[0].id, new Date(Date.now() - 60_000));

    await prisma.guardAssignment.update({ where: { id: first.id }, data: { endsAt: new Date(Date.now() - 1000) } });
    await assignGuard(guard.id, clients[1].id);

    expect((await scopeOf(guard)).body.clientId).toBe(clients[1].id);
    expect((await scopeOf(guard, String(clients[0].id))).status).toBe(403);
  });

  it("guardia: una asignación que aún no empieza no da cliente", async () => {
    const { organization, clients } = await buildOrganization();
    const guard = await buildUser("GUARD", { scope: { organizationId: organization.id, clientId: null } });
    await assignGuard(guard.id, clients[0].id, new Date(Date.now() + 86_400_000));

    expect((await scopeOf(guard)).body.clientId).toBeNull();
  });

  it("guardia asignado a un cliente de OTRA organización: sin cliente", async () => {
    const mine = await buildOrganization();
    const other = await buildOrganization();
    const guard = await buildUser("GUARD", { scope: { organizationId: mine.organization.id, clientId: null } });
    await assignGuard(guard.id, other.clients[0].id);

    expect((await scopeOf(guard)).body.clientId).toBeNull();
  });

  it("ADMIN de organización con varios clientes: elige con X-Client-Id; sin encabezado, ninguno", async () => {
    const { organization, clients } = await buildOrganization("COMPANY", 2);
    const admin = await buildUser("ADMIN", { scope: { organizationId: organization.id, clientId: null } });

    expect((await scopeOf(admin)).body).toEqual({ organizationId: organization.id, clientId: null });
    expect((await scopeOf(admin, String(clients[1].id))).body).toEqual({ organizationId: organization.id, clientId: clients[1].id });
  });

  it("ADMIN: X-Client-Id de otra organización o de un cliente inactivo es 403; uno inválido es 400", async () => {
    const mine = await buildOrganization("COMPANY", 2);
    const other = await buildOrganization();
    const admin = await buildUser("ADMIN", { scope: { organizationId: mine.organization.id, clientId: null } });
    await prisma.client.update({ where: { id: mine.clients[1].id }, data: { active: false } });

    expect((await scopeOf(admin, String(other.clients[0].id))).status).toBe(403);
    expect((await scopeOf(admin, String(mine.clients[1].id))).status).toBe(403);
    expect((await scopeOf(admin, "abc")).status).toBe(400);
  });

  it("ADMIN de producto 1 (un solo cliente): ese cliente sin enviar X-Client-Id", async () => {
    const { organization, clients } = await buildOrganization("DIRECT", 1);
    const admin = await buildUser("ADMIN", { scope: { organizationId: organization.id, clientId: null } });

    expect((await scopeOf(admin)).body).toEqual({ organizationId: organization.id, clientId: clients[0].id });
  });

  it("organización inactiva: alcance vacío", async () => {
    const { organization } = await buildOrganization("DIRECT", 1);
    const admin = await buildUser("ADMIN", { scope: { organizationId: organization.id, clientId: null } });
    await prisma.organization.update({ where: { id: organization.id }, data: { active: false } });

    expect((await scopeOf(admin)).body).toEqual({ organizationId: null, clientId: null });
  });
});
