import { PrismaClient } from "@prisma/client";

export const locationsSeed = async (prisma: PrismaClient) => {
  console.log("Seeding locations...");

  const zones = ["A", "B", "C", "D", "E", "F"];

  for (const zone of zones) {
      const zoneName = `Zona ${zone}`;
      
      // upsert to avoid duplicates
      await prisma.location.upsert({
          where: { name: zoneName },
          update: {},
          create: {
              aisle: "Zona",
              spot: zone,
              name: zoneName,
              isOccupied: false,
              active: true,
          }
      });
  }
  
  console.log("Locations seeded successfully.");
};
