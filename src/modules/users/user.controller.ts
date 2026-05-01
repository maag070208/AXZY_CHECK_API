import { Request, Response } from "express";
import { createTResult } from "@src/core/mappers/tresult.mapper";
import { addUser, getUserByUsername, getUsers, getDataTableUsers } from "./user.service";

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

    console.log("------------------------ USER ------------------------------")
    console.log("NAME", user.name)
    console.log("LASTNAME", user.lastName)
    console.log("USERNAME", user.username)
    console.log("ROLE", user.role?.name)
    console.log("------------------------ USER ------------------------------")

    console.log("------------------------ SCHEDULE ------------------------------")
    console.log("START", user?.schedule?.startTime)
    console.log("END", user?.schedule?.endTime)
    console.log("------------------------ SCHEDULE ------------------------------")

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

      // Obtener hora actual en Tijuana (America/Tijuana)
      const now = new Date();
      
      // También podemos usar Intl.DateTimeFormat para más control
      const tijuanaFormatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Tijuana',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });
      
      const tijuanaTimeParts = tijuanaFormatter.formatToParts(now);
      const tijuanaHour = parseInt(tijuanaTimeParts.find(part => part.type === 'hour')?.value || '0');
      const tijuanaMinute = parseInt(tijuanaTimeParts.find(part => part.type === 'minute')?.value || '0');
      
      // Formato HH:mm para Tijuana
      const currentHourStr = tijuanaHour.toString().padStart(2, '0');
      const currentMinuteStr = tijuanaMinute.toString().padStart(2, '0');
      const currentTime = `${currentHourStr}:${currentMinuteStr}`;
      
      // Minutos totales en Tijuana
      const currentTotalMinutes = tijuanaHour * 60 + tijuanaMinute;
      
      // Otra opción: usar getHours/minutes del objeto Date ajustado
      const tijuanaDate = new Date(now.toLocaleString('en-US', { timeZone: 'America/Tijuana' }));
      const altTijuanaHour = tijuanaDate.getHours();
      const altTijuanaMinute = tijuanaDate.getMinutes();
      
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

      // Logs para depuración
      console.log("DEBUG - Validación de horario:");
      console.log("Hora UTC:", now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0'));
      console.log("Hora Tijuana:", currentTime);
      console.log("Hora Tijuana (alternativa):", altTijuanaHour.toString().padStart(2, '0') + ':' + altTijuanaMinute.toString().padStart(2, '0'));
      console.log("Turno asignado:", `${shiftStart} - ${shiftEnd}`);
      console.log("Minutos actual en Tijuana:", currentTotalMinutes);
      console.log("Minutos inicio:", startTotalMinutes);
      console.log("Minutos fin:", endTotalMinutes);
      console.log("¿Turno nocturno?:", endTotalMinutes < startTotalMinutes);
      console.log("¿Dentro del horario?:", isInShift);

      if (!isInShift) {
        return res.status(403).json(createTResult("", ["Fuera de horario de turno"]));
      }
    }

    // Update logged in status
    const { updateUser } = require('./user.service');
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
     // Assuming user id is in req.body or derived from token if passed?
     // Actually logout is often just client-side, but we need to update DB.
     // If we use middleware, we have user in res.locals.user
     // But if token is expired? We might still want to clear DB.
     // Typically logout endpoint requires auth.
     
     // Let's assume passed in body or strictly from auth middleware.
     // If we use auth middleware, we can access user id.
     const { id } = req.body; // Or from token
     // If we use middleware, 'req.user' or 'res.locals.user'
     // Let's rely on body for simplicity if middleware not used, or better user attached.
     // I'll check if user attached.
     
     // Actually, let's use the ID from the token if available. 
     // But if token invalid, we can't identify user easily to logout.
     // Let's accept ID in body for force logout, or rely on token.
     // User requirement: "si se sale de app, no cerrarle sesion". 
     // "cerrarle la sesion en automatico" if active out of shift.
     
     // For explicit logout (button click):
     if (res.locals.user) {
         const { updateUser } = require('./user.service');
         await updateUser(res.locals.user.id, { isLoggedIn: false });
         return res.status(200).json(createTResult(true));
     } else {
         // Maybe passed in body?
         if (req.body.userId) {
             const { updateUser } = require('./user.service');
             await updateUser(req.body.userId, { isLoggedIn: false });
             return res.status(200).json(createTResult(true));
         }
     }
     
     return res.status(200).json(createTResult(true)); // Just return specific success even if no-op
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

    return res.status(201).json(createTResult(user));
  } catch (error: any) {
    return res.status(500).json(createTResult(null, error.message));
  }
};

export const getCoachesList = async (req: Request, res: Response) => {
  try {
    const { getCoaches } = require("./user.service");
    const coaches = await getCoaches();
    return res.status(200).json(createTResult(coaches));
  } catch (error: any) {
    return res.status(500).json(createTResult(null, error.message));
  }
};
export const updateUserProfile = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, lastName, username, shiftStart, shiftEnd, scheduleId, roleId, role } = req.body;

    const { updateUser, getUserByUsername } = require("./user.service");

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
      roleId: roleId ? Number(roleId) : undefined,
      role,
      shiftStart,
      shiftEnd,
      scheduleId: scheduleId ? Number(scheduleId) : undefined
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
    const { getUserById, updateUser } = require("./user.service");

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
    const { updateUser } = require("./user.service");

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
    const { deleteUser: deleteUserService } = require("./user.service");
    await deleteUserService(Number(id));
    return res.status(200).json(createTResult(true));
  } catch (error: any) {
    if (error.code === 'P2003') {
        return res.status(400).json(createTResult(null, ['No se puede eliminar este usuario porque tiene registros de historial o asignaciones.']));
    }
    return res.status(500).json(createTResult(null, error.message));
  }
};
