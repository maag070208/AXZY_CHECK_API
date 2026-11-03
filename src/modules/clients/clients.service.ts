import { Client } from "@prisma/client";
import { AppError } from "@src/core/errors/app-error";
import { prismaClient } from "@src/core/config/database";
import { ClientScope as Scope } from "@src/core/scope/client-scope";

const CLIENT_SELECT = { id: true, organizationId: true, name: true, type: true, active: true } as const;

const organizationOf = (scope: Scope | undefined): number => {
  if (scope?.organizationId == null) {
    throw new AppError("ORGANIZATION_REQUIRED", "El usuario no tiene organización", 403);
  }
  return scope.organizationId;
};

/** Clientes de la organización del alcance (fase 3: los administra la empresa de seguridad). */
export const listClients = async (scope: Scope | undefined) => {
  const organizationId = organizationOf(scope);
  return prismaClient.client.findMany({
    where: { organizationId },
    select: { ...CLIENT_SELECT, createdAt: true, updatedAt: true },
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });
};

export const createClient = async (scope: Scope | undefined, input: { name: string; type: Client["type"] }) => {
  const organizationId = organizationOf(scope);
  const name = input.name.trim();
  const existing = await prismaClient.client.findFirst({ where: { organizationId, name } });
  if (existing) throw new AppError("CLIENT_NAME_TAKEN", "Ya existe un cliente con ese nombre en la organización", 409);
  return prismaClient.client.create({ data: { organizationId, name, type: input.type }, select: { ...CLIENT_SELECT, createdAt: true } });
};

/** Cliente de la organización del alcance; de otra organización es "no encontrado". */
const findClientInOrganization = async (scope: Scope | undefined, id: number) => {
  const organizationId = organizationOf(scope);
  const client = await prismaClient.client.findFirst({ where: { id, organizationId } });
  if (!client) throw new AppError("CLIENT_NOT_FOUND", "Cliente no encontrado", 404);
  return client;
};

export const updateClient = async (
  scope: Scope | undefined,
  id: number,
  input: { name?: string; type?: Client["type"]; active?: boolean },
) => {
  const current = await findClientInOrganization(scope, id);
  const name = input.name?.trim();
  if (name && name !== current.name) {
    const taken = await prismaClient.client.findFirst({ where: { organizationId: current.organizationId, name, NOT: { id } } });
    if (taken) throw new AppError("CLIENT_NAME_TAKEN", "Ya existe un cliente con ese nombre en la organización", 409);
  }
  return prismaClient.client.update({
    where: { id },
    data: {
      ...(name ? { name } : {}),
      ...(input.type ? { type: input.type } : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
    },
    select: { ...CLIENT_SELECT, createdAt: true, updatedAt: true },
  });
};
