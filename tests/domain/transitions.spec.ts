/**
 * [T-F0-08] Tablas de transición de estado: reglas puras, escritura condicionada
 * y que AppError llega al cliente con su código (no como 500 genérico).
 */
import request from "supertest";
import { app } from "@src/app";
import { assertStatusUpdated, assertTransition, ASSIGNMENT_TRANSITIONS, INCIDENT_TRANSITIONS, INVITATION_TRANSITIONS } from "@src/core/transitions/transitions";
import { resetDatabase, disconnectDatabase, prisma } from "../setup/db";
import { buildUser, tokenFor } from "../factories";

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await disconnectDatabase();
});

describe("reglas puras", () => {
  it("permite una transición definida", () => {
    expect(() => assertTransition(ASSIGNMENT_TRANSITIONS, "PENDING", "CHECKING")).not.toThrow();
  });

  it("rechaza una transición no definida con código estable y 409", () => {
    expect(() => assertTransition(ASSIGNMENT_TRANSITIONS, "REVIEWED", "CHECKING")).toThrow(
      expect.objectContaining({ code: "INVALID_TRANSITION", status: 409 }),
    );
  });

  it("un estado terminal no tiene salidas (invitación EXITED)", () => {
    expect(() => assertTransition(INVITATION_TRANSITIONS, "EXITED", "ENTERED")).toThrow(
      expect.objectContaining({ code: "INVALID_TRANSITION" }),
    );
  });

  it("no se puede repetir el mismo estado si no está en la tabla", () => {
    expect(() => assertTransition(INCIDENT_TRANSITIONS, "ATTENDED", "ATTENDED")).toThrow(
      expect.objectContaining({ code: "INVALID_TRANSITION" }),
    );
  });

  it("una escritura condicionada que no afectó filas responde 409 STATUS_CHANGED", () => {
    expect(() => assertStatusUpdated(0)).toThrow(expect.objectContaining({ code: "STATUS_CHANGED", status: 409 }));
    expect(() => assertStatusUpdated(1)).not.toThrow();
  });
});

describe("API: resolver incidente", () => {
  it("resolver dos veces responde 409 INVALID_TRANSITION en la segunda", async () => {
    const admin = await buildUser("ADMIN");
    const guard = await buildUser("GUARD");
    const incident = await prisma.incident.create({ data: { guardId: guard.id, title: "Prueba" } });
    const token = `Bearer ${tokenFor(admin)}`;

    const first = await request(app).put(`/api/v1/incidents/${incident.id}/resolve`).set("Authorization", token);
    expect(first.status).toBe(200);

    const second = await request(app).put(`/api/v1/incidents/${incident.id}/resolve`).set("Authorization", token);
    expect(second.status).toBe(409);
    expect(second.body.code).toBe("INVALID_TRANSITION");
  });

  it("incidente inexistente responde 404 con código", async () => {
    const admin = await buildUser("ADMIN");
    const res = await request(app).put(`/api/v1/incidents/999999/resolve`).set("Authorization", `Bearer ${tokenFor(admin)}`);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("INCIDENT_NOT_FOUND");
  });
});
