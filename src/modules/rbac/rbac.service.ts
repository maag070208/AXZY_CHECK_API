import { prismaClient } from "@src/core/config/database";

/** Matriz RBAC completa: roles con sus permisos y catálogo de permisos. */
export const getRbacMatrix = async () => {
  const [roles, permissions] = await Promise.all([
    prismaClient.role.findMany({
      orderBy: { id: "asc" },
      select: {
        name: true,
        value: true,
        permissions: { select: { permission: { select: { code: true } } } },
      },
    }),
    prismaClient.permission.findMany({
      orderBy: { code: "asc" },
      select: { code: true, description: true },
    }),
  ]);

  return {
    roles: roles.map((role) => ({
      name: role.name,
      value: role.value,
      permissions: role.permissions.map((rp) => rp.permission.code).sort(),
    })),
    permissions,
  };
};

/** Reemplaza la matriz de un rol. Valida que todos los códigos existan. */
export const updateRolePermissions = async (roleName: string, codes: string[]) => {
  const role = await prismaClient.role.findUnique({ where: { name: roleName } });
  if (!role) throw new Error("Rol no encontrado");

  const unique = [...new Set(codes)];
  const permissions = await prismaClient.permission.findMany({
    where: { code: { in: unique } },
    select: { id: true, code: true },
  });
  if (permissions.length !== unique.length) {
    throw new Error("Hay permisos que no existen");
  }

  // Evita dejar a ADMIN sin acceso a la administración de RBAC.
  if (roleName === "ADMIN" && !unique.includes("users.manage")) {
    throw new Error("ADMIN no puede perder el permiso users.manage");
  }

  await prismaClient.$transaction(async (tx) => {
    await tx.rolePermission.deleteMany({ where: { roleId: role.id } });
    await tx.rolePermission.createMany({
      data: permissions.map((permission) => ({
        roleId: role.id,
        permissionId: permission.id,
      })),
    });
  });

  return getRbacMatrix();
};
