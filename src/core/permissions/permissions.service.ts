import { prismaClient } from "@src/core/config/database";
import { PermissionCode, ROLE_PERMISSIONS } from "./permission-matrix";

/**
 * ¿El rol tiene el permiso? Se consulta en cada petición: un cambio en
 * RolePermission surte efecto de inmediato, sin volver a iniciar sesión.
 */
export const roleHasPermission = async (roleName: string, code: PermissionCode): Promise<boolean> => {
  const count = await prismaClient.rolePermission.count({
    where: { permission: { code }, role: { name: roleName } },
  });
  if (count > 0) return true;

  // Transición: si el código aún no existe en la tabla Permission (migración
  // pendiente), usamos la semilla. Cuando la migración lo inserta, la DB manda
  // y una revocación de RolePermission sí surte efecto.
  const registered = await prismaClient.permission.count({ where: { code } });
  return registered === 0 && (ROLE_PERMISSIONS[roleName] ?? []).includes(code);
};

/** Permisos efectivos de un rol, leídos de RolePermission (RBAC runtime). */
export const getPermissionsForRole = async (roleName: string): Promise<PermissionCode[]> => {
  const [rows, registered] = await Promise.all([
    prismaClient.rolePermission.findMany({
      where: { role: { name: roleName } },
      select: { permission: { select: { code: true } } },
    }),
    prismaClient.permission.findMany({ select: { code: true } }),
  ]);

  const known = new Set(registered.map((p) => p.code));
  const codes = new Set(rows.map((row) => row.permission.code as PermissionCode));

  // Mismo puente que roleHasPermission: permisos nuevos de la semilla que aún
  // no han sido insertados por la migración.
  for (const code of ROLE_PERMISSIONS[roleName] ?? []) {
    if (!known.has(code)) codes.add(code);
  }

  return [...codes].sort((a, b) => a.localeCompare(b));
};
