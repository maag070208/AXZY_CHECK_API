import { PrismaClient } from "@prisma/client";

export const locationsSeed = async (prisma: PrismaClient) => {
  const locations = [
    { name: "A-0-1", aisle: "A", spot: "0", number: "1" },
    { name: "A-0-2", aisle: "A", spot: "0", number: "2" },
    { name: "A-0-3", aisle: "A", spot: "0", number: "3" },
    { name: "A-0-4", aisle: "A", spot: "0", number: "4" },
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
