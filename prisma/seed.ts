import { PrismaClient } from "@prisma/client";
import { securitySeed } from "./seeds/security";
import { locationsSeed } from "./seeds/locations";

const prisma = new PrismaClient();

async function main() {
  await securitySeed(prisma);


  await locationsSeed(prisma);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
