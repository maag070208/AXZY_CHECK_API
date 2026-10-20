/**
 * [A1/A2] Catálogos y estadísticas de ocupación para la WEB; búsqueda y alta de personas.
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

const auth = async (role: "ADMIN" | "SHIFT" | "GUARD") => `Bearer ${tokenFor(await buildUser(role))}`;

describe("catálogos de propiedades", () => {
  it("tipos y estados activos, con las transiciones permitidas desde cada estado", async () => {
    const token = await auth("SHIFT");
    const kinds = await request(app).get("/api/v1/properties/kinds").set("Authorization", token);
    expect(kinds.body.data.map((k: any) => k.code)).toEqual(expect.arrayContaining(["HOUSE", "APARTMENT"]));

    const statuses = await request(app).get("/api/v1/properties/occupancy-statuses").set("Authorization", token);
    const vacant = statuses.body.data.find((s: any) => s.code === "VACANT");
    const blocked = statuses.body.data.find((s: any) => s.code === "BLOCKED");
    expect(vacant.allowedNext).toEqual(expect.arrayContaining(["RENTED", "OWNER_OCCUPIED"]));
    expect(blocked.allowedNext).toEqual(["VACANT"]);
  });

  it("estadísticas: conteos por estado y sobreocupación", async () => {
    const kind = await prisma.propertyKind.findUniqueOrThrow({ where: { code: "HOUSE" } });
    const vacant = await prisma.occupancyStatus.findUniqueOrThrow({ where: { code: "VACANT" } });
    const type = await prisma.propertyType.findUniqueOrThrow({ where: { name: "CASA" } });
    const status = await prisma.propertyStatus.findUniqueOrThrow({ where: { name: "VACNT" } });
    await prisma.property.create({
      data: { identifier: "S-1", name: "Casa", mainStreet: "C", typeId: type.id, statusId: status.id, kindId: kind.id, occupancyStatusId: vacant.id, residentCount: 3, maxResidents: 2 },
    });
    const res = await request(app).get("/api/v1/properties/stats/occupancy").set("Authorization", await auth("ADMIN"));
    expect(res.body.data).toMatchObject({ properties: 1, residents: 3, overcrowded: 1 });
    expect(res.body.data.byStatus.find((s: any) => s.code === "VACANT").count).toBe(1);
  });

  it("el guardia no ve las estadísticas", async () => {
    const res = await request(app).get("/api/v1/properties/stats/occupancy").set("Authorization", await auth("GUARD"));
    expect(res.status).toBe(403);
  });
});

describe("personas", () => {
  it("buscar por nombre o teléfono; alta con control de duplicados", async () => {
    const token = await auth("ADMIN");
    const created = await request(app).post("/api/v1/persons").set("Authorization", token).send({ firstName: "Luisa", lastName: "Mora", phone: "6649998877" });
    expect(created.status).toBe(201);

    const byName = await request(app).get("/api/v1/persons?q=luisa").set("Authorization", token);
    expect(byName.body.data.map((p: any) => p.firstName)).toEqual(["Luisa"]);

    const dup = await request(app).post("/api/v1/persons").set("Authorization", token).send({ firstName: "Otra", phone: "6649998877" });
    expect(dup.status).toBe(409);
    expect(dup.body.code).toBe("DUPLICATE_PERSON");
    expect(dup.body.candidates).toHaveLength(1);
  });

  it("un correo mal formado se rechaza con lista de campos", async () => {
    const res = await request(app).post("/api/v1/persons").set("Authorization", await auth("ADMIN")).send({ firstName: "X", email: "no-es-correo" });
    expect(res.status).toBe(400);
    expect(res.body.issues[0].path).toBe("body.email");
  });
});
