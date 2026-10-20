/**
 * [E-11] Borrar una ubicación elimina sus consignas de ruta en una sola
 * operación y deja la ruta sin ese punto.
 */
import { deleteLocation } from "@src/modules/locations/locations.service";
import { resetDatabase, disconnectDatabase, prisma } from "../setup/db";

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await disconnectDatabase();
});

it("elimina consignas y puntos de ruta asociados, y después la ubicación", async () => {
  const point = await prisma.location.create({ data: { aisle: "A", spot: "1", number: "1", name: `Borrar-${Date.now()}` } });
  const config = await prisma.recurringConfiguration.create({
    data: {
      title: "Con punto a borrar",
      recurringLocations: {
        create: [{ locationId: point.id, tasks: { create: [{ description: "Revisar" }, { description: "Limpiar" }] } }],
      },
    },
  });

  await deleteLocation(point.id);

  expect(await prisma.location.findUnique({ where: { id: point.id } })).toBeNull();
  expect(await prisma.recurringLocation.count({ where: { configurationId: config.id } })).toBe(0);
  expect(await prisma.recurringTask.count()).toBe(0);
});
