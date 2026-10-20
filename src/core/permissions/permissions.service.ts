import { prismaClient } from "@src/core/config/database";
import { PermissionCode } from "./permission-matrix";

/**
 * ¿El rol tiene el permiso? Se consulta en cada petición: un cambio en
 * RolePermission surte efecto de inmediato, sin volver a iniciar sesión.
 */
export const roleHasPermission = async (roleName: string, code: PermissionCode): Promise<boolean> => {
  const count = await prismaClient.rolePermission.count({
    where: { permission: { code }, role: { name: roleName } },
  });
  return count > 0;
};
