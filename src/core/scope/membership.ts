import { Prisma, PrismaClient } from "@prisma/client";
import { ASSIGNED_ROLES, CLIENT_ROLES, ClientScope, scopeByClient } from "./client-scope";

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Multicliente: si es guardia o jefe de turno, le abre la asignación al cliente del alcance. Idempotente: no abre una
 * segunda asignación. La organización ya se fija al crear el usuario (obligatoria desde la contracción de fase 2); esta
 * función la usan el alta de usuarios, las semillas y las fábricas de prueba para la asignación.
 */
export const joinClient = async (db: Db, user: { id: number; roleName: string }, scope: ClientScope): Promise<void> => {
  // Rol CLIENT: el usuario queda ligado a su cliente (sin asignación de guardia).
  if (CLIENT_ROLES.includes(user.roleName)) {
    if (scope.clientId !== null) await db.user.updateMany({ where: { id: user.id }, data: { clientId: scope.clientId } });
    return;
  }
  if (scope.clientId === null || !ASSIGNED_ROLES.includes(user.roleName)) return;
  const open = await db.guardAssignment.findFirst({ where: { guardId: user.id, endsAt: null }, select: { id: true } });
  if (!open) await db.guardAssignment.create({ data: { guardId: user.id, clientId: scope.clientId } });
};

/**
 * `where` de usuarios: personal operativo del cliente del alcance. Guardias y jefes de turno con asignación abierta a
 * ese cliente, y mantenimiento de la organización (no tiene asignación por cliente). Sin cliente lanza 403.
 */
export const operativeStaffWhere = (scope: ClientScope | undefined): Prisma.UserWhereInput => {
  const { clientId } = scopeByClient(scope);
  return {
    softDelete: false,
    organizationId: scope!.organizationId as number,
    OR: [
      { role: { name: { in: [...ASSIGNED_ROLES] } }, guardAssignments: { some: { clientId, endsAt: null } } },
      { role: { name: "MAINT" } },
    ],
  };
};
