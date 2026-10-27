import { PrismaClient } from "@prisma/client";
import { catalogsSeed } from "./seeds/base/catalogs";
import { relationshipsSeed } from "./seeds/base/relationships";
import { assertSafeDatabase } from "./seeds/base/db-guard";
import { systemSettingsSeed } from "./seeds/base/system-settings";
import { hackerLog } from "./seeds/base/logger";
import { incidentCatalogsSeed } from "./seeds/client/incidents";
import { maintenanceCatalogsSeed } from "./seeds/client/maintenance";
import { clubCatalogsSeed } from "./seeds/client/club";
import { schedulesSeed } from "./seeds/client/schedules";
import { locationsSeed } from "./seeds/client/locations";
import { clientSettingsSeed } from "./seeds/client/settings";
import { securitySeed } from "./seeds/demo/security";
import { propertiesSeed } from "./seeds/demo/properties";
import { invitationsSeed } from "./seeds/demo/invitations";
import { flowsSeed } from "./seeds/flows";

const prisma = new PrismaClient();

/**
 * base    → siempre: roles, permisos, catálogos del sistema, ajustes del sistema.
 * client  → valores propios de la instalación (horarios, ubicaciones, catálogos, correos, zona).
 * demo    → usuarios y propiedades de ejemplo con contraseñas conocidas. Solo con SEED_DEMO=true
 *           y nunca en producción.
 * flows   → datos mínimos de cada flujo de negocio (personal por rol, rondas, propiedades, reportes,
 *           accesos). Solo con SEED_FLOWS=true y nunca en producción; son los mismos que usan las pruebas e2e.
 */
async function main() {
  assertSafeDatabase("seed");
  hackerLog.header('Master Seeding Sequence');

  await catalogsSeed(prisma);
  await relationshipsSeed(prisma);
  await systemSettingsSeed(prisma);

  await incidentCatalogsSeed(prisma);
  await clubCatalogsSeed(prisma);
  await maintenanceCatalogsSeed(prisma);
  await schedulesSeed(prisma);
  await locationsSeed(prisma);
  await clientSettingsSeed(prisma);

  if (process.env.SEED_DEMO === "true") {
    await securitySeed(prisma);
    await propertiesSeed(prisma);
    await invitationsSeed(prisma);
  } else {
    hackerLog.info('DEMO', 'Datos de demostración omitidos (SEED_DEMO no es "true")');
  }

  if (process.env.SEED_FLOWS === "true") {
    await flowsSeed(prisma);
  } else {
    hackerLog.info('FLOWS', 'Datos de flujos omitidos (SEED_FLOWS no es "true")');
  }

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
