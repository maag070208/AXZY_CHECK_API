/**
 * Fábricas de datos y de sesión para las pruebas.
 * Todos los datos son ficticios; nunca copiar datos reales de residentes.
 */
import jwt from "jsonwebtoken";
import { prisma } from "../setup/db";
import { joinClient } from "@src/core/scope/membership";
import type { ClientScope } from "@src/core/scope/client-scope";
import { defaultClientSeed } from "../../prisma/seeds/base/organization";

export type RoleName = "ADMIN" | "SHIFT" | "GUARD" | "MAINT" | "RESDN" | "CLIENT";

let counter = 0;
const next = () => ++counter;

/** Cliente por defecto de producto 1 (se crea si falta tras `resetDatabase`). */
export const defaultClient = () => defaultClientSeed(prisma);

/** `{ clientId }` del cliente por defecto, para `data` de filas que la prueba crea directo con Prisma. */
export const inDefaultClient = async () => ({ clientId: (await defaultClient()).clientId });

/**
 * Crea un usuario con el rol indicado. El rol debe existir (catalogsSeed).
 * Multicliente: por defecto queda en la organización y el cliente por defecto (guardias con asignación abierta),
 * como en producto 1. `scope` lo pone en otro alcance; `scope: null` lo deja en la organización por defecto
 * pero sin cliente (desde la contracción de fase 2 ningún usuario puede quedar sin organización).
 */
export async function buildUser(
  role: RoleName,
  overrides: Partial<{ name: string; lastName: string; username: string; active: boolean; scope: ClientScope | null }> = {},
) {
  const roleRow = await prisma.role.findUniqueOrThrow({ where: { name: role } });
  const n = next();
  // Desde la contracción de fase 2 todo usuario tiene organización; `scope: null` queda como
  // "usuario de la organización por defecto pero sin cliente" (cuentas previas a multicliente).
  const base = overrides.scope ?? (await defaultClient());
  const organizationId = base.organizationId ?? (await defaultClient()).organizationId;
  const scope: ClientScope = { organizationId, clientId: base.clientId };
  const user = await prisma.user.create({
    data: {
      name: overrides.name ?? `Usuario${n}`,
      lastName: overrides.lastName ?? `Prueba${n}`,
      username: overrides.username ?? `${role.toLowerCase()}_${n}`,
      password: "not-used-in-tests",
      active: overrides.active ?? true,
      roleId: roleRow.id,
      organizationId,
    },
  });
  await joinClient(prisma, { id: user.id, roleName: role }, scope);
  return prisma.user.findUniqueOrThrow({ where: { id: user.id }, include: { role: true } });
}

/**
 * Token con la misma forma que emite POST /users/login:
 * { id, name, lastName, username, role }.
 */
export function tokenFor(user: { id: number; name: string; lastName: string | null; username: string; role: { name: string } }): string {
  return jwt.sign(
    {
      id: user.id,
      name: user.name,
      lastName: user.lastName,
      username: user.username,
      role: user.role.name,
    },
    process.env.APP_SECRET as string,
    { expiresIn: "1h" },
  );
}

/** Multicliente: organización con un cliente (o los que se pidan) para pruebas de alcance. */
export async function buildOrganization(kind: "DIRECT" | "COMPANY" = "COMPANY", clientCount = 1) {
  const n = next();
  const organization = await prisma.organization.create({ data: { name: `Organización${n}`, kind } });
  const clients = [];
  for (let i = 1; i <= clientCount; i += 1) {
    clients.push(await prisma.client.create({ data: { organizationId: organization.id, name: `Cliente${n}-${i}`, type: "RESIDENTIAL" } }));
  }
  return { organization, clients };
}

/** Asignación abierta de un guardia a un cliente (desde ahora, salvo que se indique). */
export function assignGuard(guardId: number, clientId: number, startsAt: Date = new Date(Date.now() - 1000)) {
  return prisma.guardAssignment.create({ data: { guardId, clientId, startsAt } });
}
