import { joinClient } from "@src/core/scope/membership";
import type { ClientScope } from "@src/core/scope/client-scope";
import { prismaClient } from "@src/core/config/database";
import { ITDataTableFetchParams, ITDataTableResponse } from "@src/core/dto/datatable.dto";
import { getPrismaPaginationParams } from "@src/core/utils/prisma-pagination.utils";
import { syncLegacyResident } from "@src/modules/residents/legacy-sync";
import { AppError } from "@src/core/errors/app-error";

/** Multicliente: los usuarios que se listan son solo de la organización del alcance. */
const usersInclude = {
  schedule: true,
  role: true,
  assignments: true,
  guardAssignments: {
    where: { endsAt: null },
    select: { id: true, clientId: true, startsAt: true, client: { select: { id: true, name: true, type: true } } },
    take: 1,
  },
} as const;

/** Aplana la asignación de cliente abierta en `guardAssignment` (lo que consume la WEB). */
const withGuardAssignment = (row: any) => {
  const { guardAssignments, ...rest } = row;
  return { ...rest, guardAssignment: guardAssignments?.[0] ?? null };
};

export const getUsers = async (search: string | undefined, scope: ClientScope) => {
  if (scope.organizationId === null) throw new AppError("ORGANIZATION_REQUIRED", "El usuario no tiene organización", 403);
  const where: any = { softDelete: false, organizationId: scope.organizationId };
  if (search) {
    where.OR = [
      { name: { contains: search } },
      { lastName: { contains: search } },
      { username: { contains: search } },
    ];
  }
  const rows = await prismaClient.user.findMany({ where, orderBy: { name: 'asc' }, include: usersInclude });
  return rows.map(withGuardAssignment);
};

export const getDataTableUsers = async (params: ITDataTableFetchParams, scope: ClientScope): Promise<ITDataTableResponse<any>> => {
  if (scope.organizationId === null) throw new AppError("ORGANIZATION_REQUIRED", "El usuario no tiene organización", 403);
  const { pendingTasks, password: _hidden, ...restFilters } = (params.filters ?? {}) as Record<string, unknown>;
  // Ni filtrar ni ordenar por la clave: permitiría adivinar el hash carácter por carácter.
  const sort = params.sort?.key === "password" ? undefined : params.sort;
  const prismaParams = getPrismaPaginationParams({ ...params, sort, filters: restFilters as any });

  const where: any = {
    ...prismaParams.where,
    softDelete: false,
    organizationId: scope.organizationId,
  };

  if (pendingTasks === true) {
    where.assignments = { some: { tasks: { some: { completed: false } } } };
  } else if (pendingTasks === false) {
    where.assignments = { none: { tasks: { some: { completed: false } } } };
  }

  const [rows, total] = await Promise.all([
    prismaClient.user.findMany({
      ...prismaParams,
      where,
      include: usersInclude
    }),
    prismaClient.user.count({ where })
  ]);

  return { rows: rows.map(withGuardAssignment), total };
};

export const getUserByUsername = async (username: string) => {
  return prismaClient.user.findFirst({
    where: {
      username,
      softDelete: false,
    },
    include: {
      schedule: true,
      role: true,
      residentProfile: { select: { photoUrl: true } },
    }
  });
};

/**
 * Multicliente: el usuario nuevo queda en la organización de quien lo da de alta y, si es guardia o jefe de turno,
 * asignado al cliente con el que trabaja quien lo da de alta (`scope`).
 */
export const addUser = async (data: any, scope: ClientScope) => {
  // Desde la contracción de fase 2, todo usuario pertenece a una organización.
  if (scope.organizationId === null) throw new AppError("ORGANIZATION_REQUIRED", "El usuario no tiene organización", 403);
  const { role: roleName, ...userData } = data;
  
  let targetRoleId = userData.roleId;
  
  if (!targetRoleId && roleName) {
      const roleObj = await prismaClient.role.findUnique({ where: { name: roleName } });
      if (roleObj) targetRoleId = roleObj.id;
  }
  if (!targetRoleId || !(await prismaClient.role.findUnique({ where: { id: Number(targetRoleId) }, select: { id: true } }))) {
      throw new AppError("ROLE_NOT_FOUND", "El rol indicado no existe", 400);
  }

  // Rol CLIENT: se crea ligado a un cliente concreto del alcance (el elegido por el administrador).
  const targetRole = await prismaClient.role.findUnique({ where: { id: Number(targetRoleId) }, select: { name: true } });
  if (targetRole?.name === "CLIENT") {
      if (scope.clientId === null) throw new AppError("CLIENT_REQUIRED", "Elige un cliente para crear su administrador", 400);
      userData.clientId = scope.clientId;
  }

  // Auto-Assign Recurring Configs if Guard/Staff
  if (targetRoleId) {
      const role = await prismaClient.role.findUnique({ where: { id: Number(targetRoleId) } });
      if (role && (role.name === 'GUARD' || role.name === 'SHIFT' || role.name === 'MAINT')) {
          // Solo las rutas del cliente actual; sin cliente en el alcance no se conecta ninguna.
          const allDirectives = scope.clientId === null ? [] : await prismaClient.recurringConfiguration.findMany({
              where: { active: true, clientId: scope.clientId },
              select: { id: true }
          });
          
          const connectIds = allDirectives.map(d => ({ id: d.id }));
          
          if (connectIds.length > 0) {
              userData.recurringConfigurations = {
                  connect: connectIds
              };
          }
      }
  }

  return prismaClient.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
          ...userData,
          roleId: Number(targetRoleId),
          organizationId: scope.organizationId,
      },
      include: { role: { select: { name: true } } },
    });
    await joinClient(tx, { id: created.id, roleName: created.role.name }, scope);
    await syncLegacyResident(tx, created.id);
    const { role: _role, ...user } = created;
    return { ...user, organizationId: scope.organizationId ?? user.organizationId };
  });
};

/** Usuario de la organización del alcance; de otra organización es "no encontrado". */
const findUserInOrganization = async (id: number, scope: ClientScope) => {
  if (scope.organizationId === null) throw new AppError("ORGANIZATION_REQUIRED", "El usuario no tiene organización", 403);
  const user = await prismaClient.user.findFirst({ where: { id, softDelete: false, organizationId: scope.organizationId }, select: { id: true } });
  if (!user) throw new AppError("USER_NOT_FOUND", "Usuario no encontrado", 404);
  return user;
};

/** Actualización interna (login/logout/cambio de contraseña propio): sin validar alcance. */
export const updateUser = async (id: number, data: any) => {
  const { role: roleName, ...userData } = data;
  
  if (!userData.roleId && roleName) {
      const roleObj = await prismaClient.role.findUnique({ where: { name: roleName } });
      if (roleObj) userData.roleId = roleObj.id;
  }

  // Los residentes (tabla Resident) siguen al usuario en la misma transacción.
  return prismaClient.$transaction(async (tx) => {
    const updated = await tx.user.update({ where: { id }, data: userData });
    await syncLegacyResident(tx, id);
    return updated;
  });
};

/**
 * Actualización desde la API: el usuario administrado tiene que ser de la organización del alcance.
 * Si el rol cambia a CLIENT se liga al cliente elegido; al salir de CLIENT se limpia la liga.
 */
export const updateUserInScope = async (id: number, data: any, scope: ClientScope) => {
  await findUserInOrganization(id, scope);
  const roleId = data.roleId ? Number(data.roleId) : null;
  if (roleId !== null) {
    const role = await prismaClient.role.findUnique({ where: { id: roleId }, select: { name: true } });
    if (role?.name === "CLIENT") {
      if (scope.clientId === null) throw new AppError("CLIENT_REQUIRED", "Elige un cliente para su administrador", 400);
      data = { ...data, clientId: scope.clientId };
    } else {
      data = { ...data, clientId: null };
    }
  }
  return updateUser(id, data);
};

export const getUserById = async (id: number, scope: ClientScope) => {
  if (scope.organizationId === null) throw new AppError("ORGANIZATION_REQUIRED", "El usuario no tiene organización", 403);
  return prismaClient.user.findFirst({
    where: { id, softDelete: false, organizationId: scope.organizationId },
  });
};

/** Detalle para la WEB: el propio perfil, o el de un usuario de la misma organización. */
export const getUserProfileInScope = async (id: number, scope: ClientScope) => {
  if (scope.organizationId === null) throw new AppError("ORGANIZATION_REQUIRED", "El usuario no tiene organización", 403);
  const user = await prismaClient.user.findFirst({
    where: { id, softDelete: false, organizationId: scope.organizationId },
    include: { role: true, schedule: true, guardAssignments: { where: { endsAt: null }, select: { id: true, clientId: true, client: { select: { id: true, name: true, type: true } } }, take: 1 } },
  });
  if (!user) return null;
  const { password: _password, photoKey: _photoKey, guardAssignments, ...safeUser } = user;
  return { ...safeUser, guardAssignment: guardAssignments[0] ?? null };
};

/**
 * Perfil propio (o de cualquier usuario para ADMIN). Incluye rol y horario para
 * que la APP pueda mostrar el perfil de solo lectura del guardia, y nunca
 * devuelve el hash de la contraseña.
 */
export const getUserProfile = async (id: number) => {
  const user = await prismaClient.user.findFirst({
    where: { id, softDelete: false },
    include: { role: true, schedule: true },
  });
  if (!user) return null;

  const { password: _password, photoKey: _photoKey, ...safeUser } = user;
  return safeUser;
};


export const getLoggedInGuards = async (excludeUserId: number) => {
  return prismaClient.user.findMany({
    where: {
      role: {
        name: {
          in: ['GUARD', 'SHIFT', 'MAINT'],
        }
      },
      isLoggedIn: true,
      id: {
        not: excludeUserId,
      },
    },
    include: { role: true }
  });
};

export const deleteUser = async (id: number, scope: ClientScope) => {
  if (scope.organizationId === null) throw new AppError("ORGANIZATION_REQUIRED", "El usuario no tiene organización", 403);
  const user = await prismaClient.user.findFirst({ where: { id, organizationId: scope.organizationId } });
  if (!user) return null;

  return prismaClient.$transaction(async (tx) => {
    const deleted = await tx.user.update({
      where: { id },
      data: {
        softDelete: true,
        active: false,
        username: `${user.username}_deleted_${Date.now()}`
      }
    });
    await syncLegacyResident(tx, id);
    return deleted;
  });
};

// ---- Endurecimiento de sesión (auditoría S-25, S-26) ----

/** Intentos fallidos antes de bloquear la cuenta, y minutos de bloqueo. */
export const LOGIN_MAX_ATTEMPTS = Number(process.env.LOGIN_MAX_ATTEMPTS ?? 5);
export const LOGIN_LOCK_MINUTES = Number(process.env.LOGIN_LOCK_MINUTES ?? 15);

/** Registra un intento fallido; al llegar al máximo bloquea la cuenta y reinicia el contador. */
export const registerFailedLogin = async (userId: number, currentFailures: number) => {
  const failures = currentFailures + 1;
  const lock = failures >= LOGIN_MAX_ATTEMPTS;
  await prismaClient.user.update({
    where: { id: userId },
    data: {
      failedLoginCount: lock ? 0 : failures,
      lockedUntil: lock ? new Date(Date.now() + LOGIN_LOCK_MINUTES * 60 * 1000) : null,
    },
  });
  return { locked: lock };
};

/** Inicio de sesión correcto: limpia el contador y el bloqueo. */
export const resetLoginAttempts = async (userId: number) => {
  await prismaClient.user.update({ where: { id: userId }, data: { failedLoginCount: 0, lockedUntil: null } });
};

/** Revoca todas las sesiones del usuario: los tokens emitidos antes dejan de ser válidos. */
export const bumpTokenVersion = async (userId: number): Promise<number> => {
  const updated = await prismaClient.user.update({
    where: { id: userId },
    data: { tokenVersion: { increment: 1 } },
    select: { tokenVersion: true },
  });
  return updated.tokenVersion;
};
