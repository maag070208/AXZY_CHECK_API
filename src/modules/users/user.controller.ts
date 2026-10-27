import { Request, Response } from "express";
import { bumpTokenVersion, registerFailedLogin, resetLoginAttempts } from "./user.service";
import { invalidateSession } from "../common/middlewares/auth.middleware";
import { createTResult } from "@src/core/mappers/tresult.mapper";
import { getSetting } from "@src/core/settings/app-settings.service";
import { getPermissionsForRole } from "@src/core/permissions/permissions.service";
import { addUser, deleteUser as deleteUserService, getDataTableUsers, getUserById, getUserProfile, getUserByUsername, getUsers, updateUser } from "./user.service";

export const getDataTable = async (req: Request, res: Response) => {
  try {
    const result = await getDataTableUsers(req.body);
    return res.status(200).json(createTResult(result));
  } catch (error: any) {
    return respondError(res, error);
  }
};

import {
  comparePassword,
  generateJWT,
  hashPassword,
} from "@src/core/utils/security";
import { respondError } from "@src/core/errors/http-error";

export const login = async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;
    const user = await getUserByUsername(username);
    // Mismo mensaje con usuario inexistente o clave errónea: no se revela qué cuentas existen.
    const invalidCredentials = () => res.status(401).json(createTResult("", ["Usuario o contraseña incorrectos"]));
    if (!user) {
      return invalidCredentials();
    }

    // S-25: cuenta bloqueada temporalmente por intentos fallidos.
    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      const minutes = Math.max(1, Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000));
      return res.status(429).json(createTResult("", [`Demasiados intentos fallidos. Intenta de nuevo en ${minutes} minuto(s).`]));
    }

    const isPasswordValid = await comparePassword(password, user.password);

    if (!isPasswordValid) {
      await registerFailedLogin(user.id, user.failedLoginCount ?? 0);
      return invalidCredentials();
    }

    // Solo quien conoce la clave se entera de que su cuenta está desactivada.
    if (!user.active) {
      return res.status(403).json(createTResult("", ["Tu cuenta está desactivada"]));
    }

    // SHIFT CHECK - Validar por horario del schedule
    // Aplicar a GUARD, SHIFT, MAINT
    if (user.role?.name === 'GUARD' || user.role?.name === 'SHIFT' || user.role?.name === 'MAINT') {
      // Verificar que el usuario tenga un schedule asignado
      if (!user.schedule) {
        return res.status(403).json(createTResult("", ["No tiene un horario asignado"]));
      }

      const shiftStart = user.schedule.startTime;
      const shiftEnd = user.schedule.endTime;

      // Validar que los horarios existan
      if (!shiftStart || !shiftEnd) {
        return res.status(403).json(createTResult("", ["Horario no configurado correctamente"]));
      }

      // Hora actual en la zona horaria del cliente (ajuste app.timezone).
      const timeZone = await getSetting("app.timezone", "UTC");
      const timeParts = new Intl.DateTimeFormat("en-US", {
        timeZone,
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).formatToParts(new Date());
      const currentHour = Number(timeParts.find((part) => part.type === "hour")?.value ?? 0) % 24;
      const currentMinute = Number(timeParts.find((part) => part.type === "minute")?.value ?? 0);
      const currentTotalMinutes = currentHour * 60 + currentMinute;

      // Convertir horarios del schedule a minutos
      const [startHour, startMinute] = shiftStart.split(':').map(Number);
      const [endHour, endMinute] = shiftEnd.split(':').map(Number);
      const startTotalMinutes = startHour * 60 + startMinute;
      const endTotalMinutes = endHour * 60 + endMinute;
      
      let isInShift = false;
      
      // Lógica para turnos nocturnos (que cruzan la medianoche)
      if (endTotalMinutes < startTotalMinutes) {
        // Turno nocturno (ej. 23:00 a 07:00)
        // Válido si la hora actual es >= inicio O <= fin
        isInShift = currentTotalMinutes >= startTotalMinutes || 
                    currentTotalMinutes <= endTotalMinutes;
      } else {
        // Turno normal (ej. 15:00 a 23:00)
        // Válido si la hora actual está entre inicio y fin
        isInShift = currentTotalMinutes >= startTotalMinutes && 
                    currentTotalMinutes <= endTotalMinutes;
      }

      if (!isInShift) {
        return res.status(403).json(createTResult("", ["Fuera de horario de turno"]));
      }
    }

    // Update logged in status
    await updateUser(user.id, { isLoggedIn: true });
    if ((user.failedLoginCount ?? 0) > 0 || user.lockedUntil) await resetLoginAttempts(user.id);

    const tokenPayload = {
      id: user.id,
      name: user.name,
      lastName: user.lastName,
      username: user.username,
      role: user.role?.name,
      // Versión de sesión (S-26): al cambiar, los tokens anteriores quedan revocados.
      tv: user.tokenVersion ?? 0,
      // Se guarda en la sesión para pintar la foto en header/drawer sin otra llamada.
      photoUrl: user.photoUrl ?? user.residentProfile?.photoUrl ?? null,
    };

    return res.status(200).json(createTResult(await generateJWT(tokenPayload)));
  } catch (error: any) {
    return respondError(res, error);
  }
};

export const logout = async (req: Request, res: Response) => {
  try {
    // La identidad viene SOLO del token. No se acepta un id en el body: así nadie
    // puede desconectar a otro usuario (antes existía un fallback por body).
    const userId = req.user?.id;
    if (!userId) return res.status(401).json(createTResult(null, ["No autenticado"]));
    await updateUser(userId, { isLoggedIn: false });
    await bumpTokenVersion(Number(userId));
    invalidateSession(Number(userId));
    return res.status(200).json(createTResult(true));
  } catch (error: any) {
    return respondError(res, error);
  }
};

export const getAllUsers = async (req: Request, res: Response) => {
  try {
    const { q } = req.query;
    const users = await getUsers(q as string);

    return res.status(200).json(createTResult(users));
  } catch (error: any) {
    return respondError(res, error);
  }
};

export const createUser = async (req: Request, res: Response) => {
  try {
    const { name, lastName, username, password, roleId, role, shiftStart, shiftEnd, scheduleId } =
      req.body;

    const existing = await getUserByUsername(username);
    if (existing) {
      return res
        .status(400)
        .json(createTResult(null, ["El nombre de usuario ya está registrado"]));
    }

    const hashed = await hashPassword(password);

    const user = await addUser({
      name,
      lastName,
      username,

      password: hashed,
      roleId: roleId ? Number(roleId) : undefined,
      role,
      shiftStart,
      shiftEnd,
      scheduleId: scheduleId ? Number(scheduleId) : undefined
    });

    // Nunca devolver el hash de la contraseña (S-09).
    const { password: _omit, ...safeUser } = user as typeof user & { password?: string };
    return res.status(201).json(createTResult(safeUser));
  } catch (error: any) {
    return respondError(res, error);
  }
};

export const getUser = async (req: Request, res: Response) => {
  try {
    const user = await getUserProfile(Number(req.params.id));
    if (!user) {
      return res.status(404).json(createTResult(null, ["Usuario no encontrado"]));
    }
    return res.status(200).json(createTResult(user));
  } catch (error: any) {
    return respondError(res, error);
  }
};

export const updateUserProfile = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, lastName, username, shiftStart, shiftEnd, scheduleId, roleId, role, photoUrl, photoKey } = req.body;

    // Solo ADMIN puede cambiar rol y horario. Sin esto, un guardia podría
    // cambiarse su propio rol a ADMIN usando PUT /users/:id sobre sí mismo.
    const isAdmin = req.user?.role === "ADMIN";
    const adminOnly = isAdmin
      ? { roleId: roleId ? Number(roleId) : undefined, role, scheduleId: scheduleId ? Number(scheduleId) : undefined, shiftStart, shiftEnd }
      : {};

    if (username) {
      const existing = await getUserByUsername(username);
      if (existing && existing.id !== Number(id)) {
        return res
          .status(400)
          .json(createTResult(null, ["El nombre de usuario ya está registrado"]));
      }
    }

    const updated = await updateUser(Number(id), {
      name,
      lastName,
      username,
      // El propio usuario puede cambiar su foto; el resto de datos personales
      // lo administra la administración.
      photoUrl,
      photoKey,
      ...adminOnly,
    });

    const { password: _omit, ...safeUser } = updated as typeof updated & { password?: string };
    return res.status(200).json(createTResult(safeUser));
  } catch (error: any) {
    if (error.code === 'P2002') {
      return res.status(400).json(createTResult(null, ["El nombre de usuario ya está registrado"]));
    }
    return respondError(res, error);
  }
};

export const changePassword = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { oldPassword, newPassword } = req.body;

    const user = await getUserById(Number(id));
    if (!user) {
      return res.status(404).json(createTResult(null, ["User not found"]));
    }

    const isValid = await comparePassword(oldPassword, user.password);
    if (!isValid) {
      return res
        .status(400)
        .json(createTResult(null, ["La contraseña actual es incorrecta"]));
    }

    const hashed = await hashPassword(newPassword);
    await updateUser(Number(id), { password: hashed });

    // Revoca las demás sesiones y entrega un token nuevo a quien cambió la contraseña (no pierde la suya).
    const tokenVersion = await bumpTokenVersion(Number(id));
    invalidateSession(Number(id));
    const full = await getUserByUsername(user.username);
    const token = await generateJWT({
      id: user.id,
      name: user.name,
      lastName: user.lastName,
      username: user.username,
      role: full?.role?.name,
      tv: tokenVersion,
      photoUrl: full?.photoUrl ?? full?.residentProfile?.photoUrl ?? null,
    });

    return res.status(200).json(createTResult({ token }));
  } catch (error: any) {
    return respondError(res, error);
  }
};

export const resetPassword = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { newPassword } = req.body;

    // TODO: Verify ADMIN role here if middleware doesn't.
    // Assuming this endpoint is protected/admin-only.

    const hashed = await hashPassword(newPassword);
    await updateUser(Number(id), { password: hashed });
    await resetLoginAttempts(Number(id));
    await bumpTokenVersion(Number(id));
    invalidateSession(Number(id));

    return res.status(200).json(createTResult(true));
  } catch (error: any) {
    return respondError(res, error);
  }
};

export const deleteUser = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const deleted = await deleteUserService(Number(id));
    if (!deleted) {
      return res.status(404).json(createTResult(null, ["Usuario no encontrado"]));
    }
    return res.status(200).json(createTResult(true));
  } catch (error: any) {
    return respondError(res, error);
  }
};

/**
 * Permisos efectivos del usuario autenticado. La WEB los usa para pintar
 * rutas/acciones; el API sigue validando cada endpoint con requirePermission.
 */
export const getMyPermissions = async (req: Request, res: Response) => {
  try {
    const role = req.user?.role;
    if (!role) {
      return res.status(401).json(createTResult(null, ["No autenticado"]));
    }
    const permissions = await getPermissionsForRole(role);
    return res.status(200).json(createTResult({ role, permissions }));
  } catch (error: any) {
    return respondError(res, error);
  }
};
