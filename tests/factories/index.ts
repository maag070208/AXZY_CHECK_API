/**
 * Fábricas de datos y de sesión para las pruebas.
 * Todos los datos son ficticios; nunca copiar datos reales de residentes.
 */
import jwt from "jsonwebtoken";
import { prisma } from "../setup/db";

export type RoleName = "ADMIN" | "SHIFT" | "GUARD" | "MAINT" | "RESDN";

let counter = 0;
const next = () => ++counter;

/** Crea un usuario con el rol indicado. El rol debe existir (catalogsSeed). */
export async function buildUser(role: RoleName, overrides: Partial<{ name: string; lastName: string; username: string; active: boolean }> = {}) {
  const roleRow = await prisma.role.findUniqueOrThrow({ where: { name: role } });
  const n = next();
  return prisma.user.create({
    data: {
      name: overrides.name ?? `Usuario${n}`,
      lastName: overrides.lastName ?? `Prueba${n}`,
      username: overrides.username ?? `${role.toLowerCase()}_${n}`,
      password: "not-used-in-tests",
      active: overrides.active ?? true,
      roleId: roleRow.id,
    },
    include: { role: true },
  });
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
