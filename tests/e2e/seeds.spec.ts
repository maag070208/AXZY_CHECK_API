/**
 * Seeds por flujo: generan los datos de cada flujo, son idempotentes y dejan cuentas
 * que inician sesión por el endpoint real de login.
 */
import { flowsSeed, FLOW_PASSWORD, FLOW_USERS, FlowUserKey } from "../../prisma/seeds/flows";
import { api, bootFlows, disconnectDatabase, expectOk, loginReal, prisma, V1 } from "./support";

afterAll(disconnectDatabase);

const counts = async () => ({
  users: await prisma.user.count(),
  locations: await prisma.location.count(),
  routes: await prisma.recurringConfiguration.count(),
  rounds: await prisma.round.count(),
  kardex: await prisma.kardex.count(),
  assignments: await prisma.assignment.count(),
  properties: await prisma.property.count(),
  periods: await prisma.occupancyPeriod.count(),
  residents: await prisma.resident.count(),
  persons: await prisma.person.count(),
  incidents: await prisma.incident.count(),
  maintenances: await prisma.maintenance.count(),
  invitations: await prisma.invitation.count(),
  authorizations: await prisma.propertyAuthorization.count(),
  handovers: await prisma.shiftHandover.count(),
  uniforms: await prisma.uniformCheck.count(),
  chat: await prisma.chatMessage.count(),
});

describe("seeds por flujo", () => {
  it("generan los datos mínimos de cada flujo", async () => {
    const ids = await bootFlows();
    const c = await counts();
    expect(c).toEqual({
      users: 6, locations: 4, routes: 1, rounds: 1, kardex: 3, assignments: 1, properties: 3, periods: 3,
      residents: 1, persons: 4, incidents: 3, maintenances: 1, invitations: 4, authorizations: 1, handovers: 1, uniforms: 1, chat: 1,
    });
    expect(ids.staff.admin).toBeGreaterThan(0);
    expect(ids.routes.locationIds).toHaveLength(4);
  });

  it("son idempotentes: correrlos otra vez no duplica nada", async () => {
    await bootFlows();
    const before = await counts();
    const log = console.log;
    console.log = () => {};
    try {
      await flowsSeed(prisma);
      await flowsSeed(prisma);
    } finally {
      console.log = log;
    }
    expect(await counts()).toEqual(before);
  });

  it("dejan el conteo de residentes consistente con el hogar", async () => {
    const ids = await bootFlows();
    const house = await prisma.property.findUniqueOrThrow({ where: { id: ids.properties.houseId } });
    expect(house.residentCount).toBe(1);
    const others = await prisma.property.findMany({ where: { id: { in: [ids.properties.apartmentId, ids.properties.vacantId] } } });
    expect(others.every((p) => p.residentCount === 0)).toBe(true);
  });

  it("cada cuenta sembrada inicia sesión por el login real", async () => {
    await bootFlows();
    for (const key of Object.keys(FLOW_USERS) as FlowUserKey[]) {
      const res = await loginReal(FLOW_USERS[key].username, FLOW_PASSWORD);
      expect(res.status).toBe(200);
      const me = await api().get(`${V1}/`).set("Authorization", `Bearer ${res.body.data}`);
      expectOk(me);
    }
  });

  it("se niegan en producción", async () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      await expect(flowsSeed(prisma)).rejects.toThrow(/producción/);
    } finally {
      process.env.NODE_ENV = previous;
    }
  });
});
