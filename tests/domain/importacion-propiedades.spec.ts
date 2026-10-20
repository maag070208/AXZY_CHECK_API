/**
 * [A1] Importación de propiedades (T-A1-T7): una fila inválida se reporta sin abortar las
 * válidas; un identificador repetido se reporta; solo quien puede administrar propiedades importa.
 */
import request from "supertest";
import { app } from "@src/app";
import { resetDatabase, disconnectDatabase, prisma } from "../setup/db";
import { buildUser, tokenFor } from "../factories";

const URL = "/api/v1/properties/import";

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await disconnectDatabase();
});

const row = (identifier: string, extra: Record<string, unknown> = {}) => ({
  identifier,
  name: `Casa ${identifier}`,
  mainStreet: "Calle Aries",
  kind: "HOUSE",
  occupancy: "VACANT",
  ...extra,
});

describe("importación", () => {
  it("T-A1-T7: las filas válidas se crean y las inválidas se reportan por número de fila", async () => {
    const admin = `Bearer ${tokenFor(await buildUser("ADMIN"))}`;
    const res = await request(app)
      .post(URL)
      .set("Authorization", admin)
      .send({
        rows: [
          row("CSV-1"),
          row("CSV-2", { name: "" }),
          row("CSV-3", { kind: "CASTILLO" }),
          row("CSV-4", { occupancy: "INVENTADA" }),
          row("CSV-5", { kind: "APARTMENT", occupancy: "RENTED", floor: 3, unitNumber: "304" }),
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.data.created).toBe(2);
    expect(res.body.data.errors.map((e: any) => e.row)).toEqual([2, 3, 4]);
    expect(res.body.data.errors[1].messages[0]).toContain('kind: tipo "CASTILLO" no existe');

    const names = (await prisma.property.findMany({ select: { identifier: true } })).map((p) => p.identifier).sort();
    expect(names).toEqual(["CSV-1", "CSV-5"]);
    const apt = await prisma.property.findUniqueOrThrow({ where: { identifier: "CSV-5" }, include: { kind: true, occupancyStatus: true } });
    expect(apt).toMatchObject({ floor: 3, unitNumber: "304" });
    expect(apt.kind.code).toBe("APARTMENT");
    expect(apt.occupancyStatus.code).toBe("RENTED");
  });

  it("un identificador repetido se reporta y no detiene el lote", async () => {
    const admin = `Bearer ${tokenFor(await buildUser("ADMIN"))}`;
    await request(app).post(URL).set("Authorization", admin).send({ rows: [row("DUP-1")] });
    const res = await request(app).post(URL).set("Authorization", admin).send({ rows: [row("DUP-1"), row("DUP-2")] });
    expect(res.body.data.created).toBe(1);
    expect(res.body.data.errors).toEqual([expect.objectContaining({ row: 1, messages: ["identifier: ya existe"] })]);
  });

  it("el jefe de turno no importa; el lote vacío y el excesivo se rechazan", async () => {
    const shift = `Bearer ${tokenFor(await buildUser("SHIFT"))}`;
    expect((await request(app).post(URL).set("Authorization", shift).send({ rows: [row("X-1")] })).status).toBe(403);

    const admin = `Bearer ${tokenFor(await buildUser("ADMIN"))}`;
    expect((await request(app).post(URL).set("Authorization", admin).send({ rows: [] })).status).toBe(400);
    const tooMany = Array.from({ length: 501 }, (_, i) => row(`M-${i}`));
    expect((await request(app).post(URL).set("Authorization", admin).send({ rows: tooMany })).status).toBe(400);
  });
});
