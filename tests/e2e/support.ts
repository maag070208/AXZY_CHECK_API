/**
 * Soporte común de las pruebas e2e HTTP: levantan la app Express real (`src/app.ts`)
 * con supertest contra la base de pruebas, con los datos de los seeds por flujo.
 */
// Las pruebas e2e hacen muchos logins seguidos desde la misma IP: se sube el tope del límite de intentos.
process.env.RATE_LIMIT_LOGIN_MAX ??= "100000";

import request from "supertest";
import { app } from "@src/app";
import { flowsSeed, FlowsResult, FLOW_PASSWORD, FLOW_USERS, FlowUserKey } from "../../prisma/seeds/flows";
import { prisma, resetDatabase, disconnectDatabase } from "../setup/db";
import { tokenFor } from "../factories";

export { prisma, disconnectDatabase };

export const api = () => request(app);
export const V1 = "/api/v1";

/** Reinicia la base y siembra todos los flujos; devuelve los ids creados. */
export const bootFlows = async (): Promise<FlowsResult> => {
  await resetDatabase();
  const log = console.log;
  console.log = () => {};
  try {
    return await flowsSeed(prisma);
  } finally {
    console.log = log;
  }
};

export type Session = { id: number; token: string; auth: string };

/** Sesión de un usuario sembrado, con un token firmado igual al de POST /users/login. */
export const sessionOf = async (key: FlowUserKey): Promise<Session> => {
  const user = await prisma.user.findUniqueOrThrow({ where: { username: FLOW_USERS[key].username }, include: { role: true } });
  const token = tokenFor(user);
  return { id: user.id, token, auth: `Bearer ${token}` };
};

/** Sesiones de los seis roles sembrados. */
export const allSessions = async () => {
  const keys = Object.keys(FLOW_USERS) as FlowUserKey[];
  const entries = await Promise.all(keys.map(async (k) => [k, await sessionOf(k)] as const));
  return Object.fromEntries(entries) as Record<FlowUserKey, Session>;
};

/** Inicia sesión por el endpoint real y devuelve el token. */
export const loginReal = async (username: string, password = FLOW_PASSWORD) => api().post(`${V1}/users/login`).send({ username, password });

/** Texto que jamás debe aparecer en una respuesta de error (stack, SQL, Prisma, hashes). */
const LEAKS = [/prisma/i, /\bat .*\(.*:\d+:\d+\)/, /\$2[aby]\$/, /invalid `/i, /ECONNREFUSED/, /select .* from "/i];

/** Verifica el formato estándar de error: TResult con success=false y mensajes en un arreglo. */
export const expectErrorShape = (body: any) => {
  expect(body.success).toBe(false);
  expect(Array.isArray(body.messages)).toBe(true);
  expect(body.messages.length).toBeGreaterThan(0);
  const text = JSON.stringify(body);
  for (const leak of LEAKS) expect(text).not.toMatch(leak);
  expect(body).not.toHaveProperty("stack");
};

/** Respuesta de error esperada: status exacto, formato estándar y (opcional) código estable. */
export const expectFail = (res: request.Response, status: number, code?: string) => {
  expect(res.status).toBe(status);
  expectErrorShape(res.body);
  if (code) expect(res.body.code).toBe(code);
};

/** Éxito estándar (TResult con success=true). */
export const expectOk = (res: request.Response, status = 200) => {
  expect(res.status).toBe(status);
  expect(res.body.success).toBe(true);
  return res.body.data;
};

/** Id que no existe en ninguna tabla. */
export const MISSING_ID = 987654;
