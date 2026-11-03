import { PrismaClient } from "@prisma/client";
import { hackerLog } from "./logger";

/**
 * Multicliente (producto 1): organización DIRECT con su cliente residencial. Reutiliza la que exista (la que creó la
 * migración 20261102120000_multi_tenant_expand o una corrida anterior); solo crea si no hay ninguna.
 */
export const defaultClientSeed = async (prisma: PrismaClient): Promise<{ organizationId: number; clientId: number }> => {
  hackerLog.info("TENANT", "Ensuring default organization and client");
  const organization =
    (await prisma.organization.findFirst({ where: { kind: "DIRECT" }, orderBy: { id: "asc" } })) ??
    (await prisma.organization.create({ data: { name: "Residencial", kind: "DIRECT" } }));
  const client =
    (await prisma.client.findFirst({ where: { organizationId: organization.id }, orderBy: { id: "asc" } })) ??
    (await prisma.client.create({ data: { organizationId: organization.id, name: "Residencial", type: "RESIDENTIAL" } }));
  return { organizationId: organization.id, clientId: client.id };
};
