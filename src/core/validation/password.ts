import { z } from "zod";

/** Contraseñas muy comunes que se rechazan siempre (en minúsculas). Lista corta y de alto impacto. */
const COMMON_PASSWORDS = new Set([
  "password", "password1", "password123", "contrasena", "contraseña", "contrasena1", "contrasena123",
  "123456", "1234567", "12345678", "123456789", "1234567890", "0123456789", "qwerty", "qwerty123", "qwertyuiop",
  "abc123", "abcd1234", "admin", "admin123", "administrador", "welcome", "welcome1", "letmein", "iloveyou",
  "barcelona", "barcelona1", "barcelona123", "checkapp", "checkapp123", "residencial", "guardia", "guardia123",
  "11111111", "00000000", "123123123", "1q2w3e4r", "q1w2e3r4", "asdfghjkl", "zxcvbnm123", "monkey123", "dragon123",
]);

export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 100;

/**
 * Política de contraseñas (auditoría S-25): 10 a 100 caracteres, al menos una letra y un número,
 * y que no sea una contraseña muy común.
 */
export const strongPassword = z
  .string()
  .min(PASSWORD_MIN, `debe tener al menos ${PASSWORD_MIN} caracteres`)
  .max(PASSWORD_MAX, `no puede pasar de ${PASSWORD_MAX} caracteres`)
  .refine((v) => /[A-Za-z]/.test(v), "debe incluir al menos una letra")
  .refine((v) => /\d/.test(v), "debe incluir al menos un número")
  .refine((v) => !COMMON_PASSWORDS.has(v.toLowerCase()), "es demasiado común; elige otra");
