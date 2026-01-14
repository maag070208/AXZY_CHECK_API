import { PrismaClient } from "@prisma/client";

export const locationsSeed = async (prisma: PrismaClient) => {
  const locations = [
    { name: "A-1-1", aisle: "A", spot: "1", number: "1" },
    { name: "B-1-1", aisle: "B", spot: "1", number: "1" },
    { name: "C-1-1", aisle: "C", spot: "1", number: "1" },
    { name: "D-1-1", aisle: "D", spot: "1", number: "1" },
  ];

  for (const location of locations) {
    const exists = await prisma.location.findFirst({
      where: { name: location.name },
    });

    if (!exists) {
      await prisma.location.create({
        data: {
          ...location,
          isOccupied: false,
        },
      });
    }
  }
};
