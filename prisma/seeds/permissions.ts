import { PrismaClient } from "@prisma/client";
import { PERMISSIONS, ROLE_PERMISSIONS } from "../../src/core/permissions/permission-matrix";

/** Sincroniza permisos y su asignación a roles desde la matriz (idempotente). */
export const permissionsSeed = async (prisma: PrismaClient) => {
    for (const permission of PERMISSIONS) {
        await prisma.permission.upsert({
            where: { code: permission.code },
            update: { description: permission.description },
            create: permission,
        });
    }

    for (const [roleName, codes] of Object.entries(ROLE_PERMISSIONS)) {
        const role = await prisma.role.findUniqueOrThrow({ where: { name: roleName } });
        const permissions = await prisma.permission.findMany({ where: { code: { in: [...codes] } } });
        await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
        await prisma.rolePermission.createMany({
            data: permissions.map((p) => ({ roleId: role.id, permissionId: p.id })),
        });
    }
};
