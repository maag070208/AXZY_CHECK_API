import { prismaClient } from "../src/core/config/database";
import { catalogsSeed } from "./seeds/catalogs";
import { incidentCatalogsSeed } from "./seeds/incidents";
import { locationsSeed } from "./seeds/locations";
import { maintenanceCatalogsSeed } from "./seeds/maintenance";
import { clubCatalogsSeed } from "./seeds/club";
import { shiftCatalogsSeed } from "./seeds/shift";
import { propertiesSeed } from "./seeds/properties";
import { relationshipsSeed } from "./seeds/relationships";
import { schedulesSeed } from "./seeds/schedules";
import { securitySeed } from "./seeds/security";
import { sysConfigSeed } from "./seeds/sysconfig";

import { hackerLog } from "./seeds/logger";

const prisma = prismaClient;

async function main() {
  hackerLog.header('Master Seeding Sequence');
  
  await catalogsSeed(prisma);
  await incidentCatalogsSeed(prisma);
  await maintenanceCatalogsSeed(prisma);
  await clubCatalogsSeed(prisma);
  await shiftCatalogsSeed(prisma);
  await schedulesSeed(prisma);
  await securitySeed(prisma);
  await locationsSeed(prisma);
  await sysConfigSeed(prisma);
  await propertiesSeed(prisma);
  await relationshipsSeed(prisma);

  hackerLog.divider();
  hackerLog.success('SYSTEM', 'Master Seeding Complete');
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
