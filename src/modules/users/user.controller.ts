import { Request, Response } from "express";
import { createTResult } from "@src/core/mappers/tresult.mapper";
import { getSetting } from "@src/core/settings/app-settings.service";
import { addUser, deleteUser as deleteUserService, getDataTableUsers, getUserById, getUserByUsername, getUsers, updateUser } from "./user.service";

export const getDataTable = async (req: Request, res: Response) => {
  try {
    const result = await getDataTableUsers(req.body);
    return res.status(200).json(createTResult(result));
  } catch (error: any) {
    return res.status(500).json(createTResult(null, error.message));
  }
};

import {
  comparePassword,
  generateJWT,
  hashPassword,
} from "@src/core/utils/security";

export const login = async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;
    const user = await getUserByUsername(username);
    if (!user) {
      return res.status(401).json(createTResult("", ["User not found"]));
    }

    const isPasswordValid = await comparePassword(password, user.password);

    if (!isPasswordValid) {
      return res.status(401).json(createTResult("", ["Contraseña invalida"]));
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

    const tokenPayload = {
      id: user.id,
      name: user.name,
      lastName: user.lastName,
      username: user.username,
      role: user.role?.name
    };

    return res.status(200).json(createTResult(await generateJWT(tokenPayload)));
  } catch (error: any) {
    return res.status(500).json(createTResult("", error.message));
  }
};

export const logout = async (req: Request, res: Response) => {
  try {
    // La identidad viene SOLO del token. No se acepta un id en el body: así nadie
    // puede desconectar a otro usuario (antes existía un fallback por body).
    const userId = req.user?.id;
    if (!userId) return res.status(401).json(createTResult(null, ["No autenticado"]));
    await updateUser(userId, { isLoggedIn: false });
    return res.status(200).json(createTResult(true));
  } catch (error: any) {
    return res.status(500).json(createTResult("", error.message));
  }
};

export const getAllUsers = async (req: Request, res: Response) => {
  try {
    const { q } = req.query;
    const users = await getUsers(q as string);

    return res.status(200).json(createTResult(users));
  } catch (error: any) {
    return res.status(500).json(createTResult("", error.message));
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
    return res.status(500).json(createTResult(null, error.message));
  }
};

export const updateUserProfile = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, lastName, username, shiftStart, shiftEnd, scheduleId, roleId, role } = req.body;

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
      ...adminOnly,
    });

    return res.status(200).json(createTResult(updated));
  } catch (error: any) {
    if (error.code === 'P2002') {
      return res.status(400).json(createTResult(null, ["El nombre de usuario ya está registrado"]));
    }
    return res.status(500).json(createTResult(null, error.message));
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

    return res.status(200).json(createTResult(true));
  } catch (error: any) {
    return res.status(500).json(createTResult(null, error.message));
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

    return res.status(200).json(createTResult(true));
  } catch (error: any) {
    return res.status(500).json(createTResult(null, error.message));
  }
};

export const deleteUser = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await deleteUserService(Number(id));
    return res.status(200).json(createTResult(true));
  } catch (error: any) {
    return res.status(500).json(createTResult(null, error.message));
  }
};
