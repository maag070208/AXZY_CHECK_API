/**
 * [E-03 · E1] El avance de cada ronda se calcula en SQL y mantiene la semántica:
 * puntos DISTINTOS escaneados por el guardia dentro de la ventana de la ronda.
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

const loc = (name: string) => prisma.location.create({ data: { aisle: "A", spot: "1", number: name, name } });

const findRow = (body: any, id: number) => {
  const data = body.data ?? body;
  return (data.rows as any[]).find((r) => r.id === id);
};

describe("avance de rondas", () => {
  it("cuenta puntos distintos dentro de la ventana y excluye lo ajeno", async () => {
    const admin = await buildUser("ADMIN");
    const guard = await buildUser("GUARD");
    const other = await buildUser("GUARD");
    const points = await Promise.all([1, 2, 3, 4].map((i) => loc(`P-${i}-${Date.now()}`)));
    const config = await prisma.recurringConfiguration.create({
      data: {
        title: "Ronda prueba",
        recurringLocations: { create: points.map((p) => ({ locationId: p.id })) },
      },
    });

    const start = new Date(Date.now() - 60 * 60 * 1000);
    const round = await prisma.round.create({
      data: { guardId: guard.id, startTime: start, status: "IN_PROGRESS", recurringConfigurationId: config.id },
    });

    await prisma.kardex.createMany({
      data: [
        { userId: guard.id, locationId: points[0].id, timestamp: new Date(start.getTime() + 1000), notes: "a" },
        // Mismo punto dos veces: cuenta una sola vez.
        { userId: guard.id, locationId: points[0].id, timestamp: new Date(start.getTime() + 2000), notes: "b" },
        { userId: guard.id, locationId: points[1].id, timestamp: new Date(start.getTime() + 3000), notes: "c" },
        // Antes del inicio de la ronda: no cuenta.
        { userId: guard.id, locationId: points[2].id, timestamp: new Date(start.getTime() - 5000), notes: "x" },
        // De otro guardia: no cuenta.
        { userId: other.id, locationId: points[3].id, timestamp: new Date(start.getTime() + 4000), notes: "y" },
      ],
    });

    const res = await request(app)
      .post("/api/v1/rounds/datatable")
      .set("Authorization", `Bearer ${tokenFor(admin)}`)
      .send({ page: 1, limit: 50 });

    expect(res.status).toBe(200);
    const row: any = findRow(res.body, round.id);
    expect(row.scannedCount).toBe(2);
    expect(row.totalLocations).toBe(4);
    expect(row.progressPercent).toBe(50);
  });

  it("una ronda cerrada no cuenta escaneos posteriores a su fin", async () => {
    const admin = await buildUser("ADMIN");
    const guard = await buildUser("GUARD");
    const point = await loc(`Cerrada-${Date.now()}`);
    const config = await prisma.recurringConfiguration.create({
      data: { title: "Cerrada", recurringLocations: { create: [{ locationId: point.id }] } },
    });
    const start = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const end = new Date(Date.now() - 60 * 60 * 1000);
    const round = await prisma.round.create({
      data: { guardId: guard.id, startTime: start, endTime: end, status: "COMPLETED", recurringConfigurationId: config.id },
    });
    await prisma.kardex.create({
      data: { userId: guard.id, locationId: point.id, timestamp: new Date(end.getTime() + 60_000), notes: "tarde" },
    });

    const res = await request(app)
      .post("/api/v1/rounds/datatable")
      .set("Authorization", `Bearer ${tokenFor(admin)}`)
      .send({ page: 1, limit: 50 });

    const row: any = findRow(res.body, round.id);
    expect(row.scannedCount).toBe(0);
    expect(row.progressPercent).toBe(0);
  });
});
