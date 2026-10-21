import { PrismaClient } from "@prisma/client";
import { relationshipsSeed } from "../base/relationships";
import { incidentCatalogsSeed } from "../client/incidents";
import { clubCatalogsSeed } from "../client/club";
import { maintenanceCatalogsSeed } from "../client/maintenance";
import { hackerLog } from "../base/logger";
import { accessFlow, AccessIds } from "./access";
import { operationsFlow, OperationsIds } from "./operations";
import { propertiesFlow, PropertyIds } from "./properties";
import { reportsFlow, ReportIds } from "./reports";
import { routesFlow, RouteIds } from "./routes";
import { staffFlow, StaffIds } from "./staff";

export * from "./constants";
export { staffFlow } from "./staff";
export { locationsFlow } from "./locations";

export interface FlowsResult {
  staff: StaffIds;
  routes: RouteIds;
  properties: PropertyIds;
  reports: ReportIds;
  operations: OperationsIds;
  access: AccessIds;
}

/**
 * Catálogos que los flujos necesitan (relaciones, incidencias, club, mantenimiento) y la zona horaria.
 * Todos son idempotentes. Requiere los catálogos base (roles, tipos, ocupación, permisos).
 */
export const flowPrerequisites = async (prisma: PrismaClient): Promise<void> => {
  await relationshipsSeed(prisma);
  await incidentCatalogsSeed(prisma);
  await clubCatalogsSeed(prisma);
  await maintenanceCatalogsSeed(prisma);
  await prisma.appSetting.upsert({
    where: { key: "app.timezone" },
    update: {},
    create: { key: "app.timezone", valueType: "string", value: "UTC", group: "general", description: "Zona horaria del cliente" },
  });
};

/**
 * Genera los datos de todos los flujos. Idempotente: correrlo otra vez no duplica nada.
 * Crea usuarios con contraseña conocida (FLOW_PASSWORD): nunca en producción.
 */
export const flowsSeed = async (prisma: PrismaClient): Promise<FlowsResult> => {
  if (process.env.NODE_ENV === "production") {
    throw new Error("[flows] Los datos de flujos crean usuarios con contraseña conocida: no se siembran en producción.");
  }
  hackerLog.info("FLOWS", "Generating flow data");
  await flowPrerequisites(prisma);
  const staff = await staffFlow(prisma);
  const routes = await routesFlow(prisma, staff);
  const properties = await propertiesFlow(prisma, staff);
  const reports = await reportsFlow(prisma, staff);
  const operations = await operationsFlow(prisma, staff);
  const access = await accessFlow(prisma, staff, properties);
  hackerLog.success("FLOWS", "Flow data ready");
  return { staff, routes, properties, reports, operations, access };
};
