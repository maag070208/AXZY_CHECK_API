import rateLimit from "express-rate-limit";

/**
 * Límite de intentos de inicio de sesión por IP (S-10 / F9).
 * El máximo es configurable por entorno para que las pruebas puedan fijarlo.
 */
export const loginRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: Number(process.env.RATE_LIMIT_LOGIN_MAX ?? 10),
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { data: null, success: false, messages: ["Demasiados intentos. Intenta de nuevo en un minuto."] },
});

/** Límite de subidas de archivos por IP (evita llenar el almacenamiento y la memoria). */
export const uploadRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: Number(process.env.RATE_LIMIT_UPLOAD_MAX ?? 30),
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { data: null, success: false, messages: ["Demasiadas subidas. Intenta de nuevo en un minuto."] },
});
