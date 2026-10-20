/**
 * [E-02 · E1] GET /recurring/my-list hace una sola consulta de escaneos,
 * no una por punto de control. Y el resultado sigue siendo correcto.
 */
import { getRecurringConfigurationsForUser } from "@src/modules/recurring/recurring.service";
import { resetDatabase, disconnectDatabase, prisma } from "../setup/db";
import { buildUser } from "../factories";

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await disconnectDatabase();
});

const location = (name: string) => prisma.location.create({ data: { aisle: "A", spot: "1", number: name, name } });

describe("getRecurringConfigurationsForUser · sin N+1", () => {
  it("marca puntos completos sin consultar kardex punto por punto", async () => {
    const guard = await buildUser("GUARD");
    const scanned = await location(`Zona-A-${Date.now()}`);
    const notScanned = await location(`Zona-B-${Date.now()}`);
    const emptyNotes = await location(`Zona-C-${Date.now()}`);
    const other = await location(`Zona-D-${Date.now()}`);

    await prisma.recurringConfiguration.create({
      data: {
        title: "Ronda A",
        guards: { connect: [{ id: guard.id }] },
        recurringLocations: {
          create: [{ locationId: scanned.id }, { locationId: notScanned.id }, { locationId: emptyNotes.id }],
        },
      },
    });
    await prisma.recurringConfiguration.create({
      data: {
        title: "Ronda B",
        guards: { connect: [{ id: guard.id }] },
        recurringLocations: { create: [{ locationId: other.id }] },
      },
    });

    await prisma.kardex.create({ data: { userId: guard.id, locationId: scanned.id, notes: "Sin novedad" } });
    // Un borrador sin notas no cuenta como completado.
    await prisma.kardex.create({ data: { userId: guard.id, locationId: emptyNotes.id, notes: "" } });
    await prisma.kardex.create({ data: { userId: guard.id, locationId: other.id, notes: "OK" } });

    const findFirst = jest.spyOn(prisma.kardex, "findFirst");
    const findMany = jest.spyOn(prisma.kardex, "findMany");

    const configs = await getRecurringConfigurationsForUser(guard.id);

    expect(findFirst).not.toHaveBeenCalled();
    expect(findMany).toHaveBeenCalledTimes(1);

    const ronda = configs.find((c: any) => c.title === "Ronda A") as any;
    const byLoc = Object.fromEntries(ronda.recurringLocations.map((l: any) => [l.locationId, l.completed]));
    expect(byLoc[scanned.id]).toBe(true);
    expect(byLoc[notScanned.id]).toBe(false);
    expect(byLoc[emptyNotes.id]).toBe(false);

    const rondaB = configs.find((c: any) => c.title === "Ronda B") as any;
    expect(rondaB.recurringLocations[0].completed).toBe(true);
    expect(rondaB.recurringLocations[0].completedAt).toBeInstanceOf(Date);
  });
});
