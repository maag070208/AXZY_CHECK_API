import { getConfig } from "@src/core/utils/config";
import dotenv from "dotenv";
dotenv.config();

export const secretKey = getConfig("APP_SECRET");

// S-26: un secreto corto se adivina por fuerza bruta. Producción exige 32+ caracteres; en otros ambientes solo avisa.
if (secretKey.length < 32) {
  const message = "[seguridad] APP_SECRET tiene menos de 32 caracteres. Usa un secreto largo y aleatorio.";
  if (process.env.NODE_ENV === "production") throw new Error(message);
  if (process.env.NODE_ENV !== "test") console.warn(message);
}
