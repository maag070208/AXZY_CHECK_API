/**
 * [F9 · hueco de rondas] Solo el guardia dueño o un supervisor (ADMIN/SHIFT)
 * puede cerrar una ronda. Antes cualquier usuario autenticado podía cerrar la
 * ronda de otro.
 */
import request from "supertest";
import { app } from "@src/app";
import { resetDatabase, disconnectDatabase, prisma } from "../setup/db";
import { buildUser, tokenFor } from "../factories";

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await disconnectDatabase();
});

const openRound = async (guardId: number) =>
  prisma.round.create({ data: { guardId, status: "IN_PROGRESS" } });

describe("PUT /rounds/:id/end · dueño o supervisor", () => {
  it("un guardia NO puede cerrar la ronda de otro guardia (403) y la ronda queda abierta", async () => {
    const owner = await buildUser("GUARD");
    const intruder = await buildUser("GUARD");
    const round = await openRound(owner.id);

    const res = await request(app)
      .put(`/api/v1/rounds/${round.id}/end`)
      .set("Authorization", `Bearer ${tokenFor(intruder)}`);

    expect(res.status).toBe(403);
    expect((await prisma.round.findUniqueOrThrow({ where: { id: round.id } })).status).toBe("IN_PROGRESS");
  });

  it("el guardia dueño sí puede cerrar su ronda", async () => {
    const owner = await buildUser("GUARD");
    const round = await openRound(owner.id);

    const res = await request(app)
      .put(`/api/v1/rounds/${round.id}/end`)
      .set("Authorization", `Bearer ${tokenFor(owner)}`);

    expect(res.status).toBe(200);
    expect((await prisma.round.findUniqueOrThrow({ where: { id: round.id } })).status).toBe("COMPLETED");
  });

  it.each(["ADMIN", "SHIFT"] as const)("el rol %s puede cerrar la ronda de cualquier guardia", async (role) => {
    const owner = await buildUser("GUARD");
    const supervisor = await buildUser(role);
    const round = await openRound(owner.id);

    const res = await request(app)
      .put(`/api/v1/rounds/${round.id}/end`)
      .set("Authorization", `Bearer ${tokenFor(supervisor)}`);

    expect(res.status).toBe(200);
  });

  it("un mantenimiento sin permiso de supervisión no puede cerrar la ronda de un guardia", async () => {
    const owner = await buildUser("GUARD");
    const maint = await buildUser("MAINT");
    const round = await openRound(owner.id);

    const res = await request(app)
      .put(`/api/v1/rounds/${round.id}/end`)
      .set("Authorization", `Bearer ${tokenFor(maint)}`);

    expect(res.status).toBe(403);
  });
});
