import pino from "pino";

/**
 * Logger estructurado (JSON en producción). Nunca registrar cuerpos de
 * petición ni datos personales: solo metadatos (requestId, ruta, status, tiempo).
 */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === "test" ? "silent" : "info"),
  base: { service: "checkapp-api" },
  timestamp: pino.stdTimeFunctions.isoTime,
});
