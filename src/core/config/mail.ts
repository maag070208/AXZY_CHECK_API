import * as nodemailer from "nodemailer";
import { Resend } from "resend";
import * as dotenv from "dotenv";

dotenv.config();

/**
 * Correo saliente. Credenciales solo por entorno (SMTP_*, RESEND_API_KEY);
 * nunca en el código. Ver .env.example.
 */
const resendApiKey = process.env.RESEND_API_KEY;
export const resend = resendApiKey ? new Resend(resendApiKey) : null;

export const mailFrom = (): string => {
  const from = process.env.MAIL_FROM;
  if (!from) throw new Error("MAIL_FROM no está configurado");
  return from;
};

export const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT ?? 465),
  secure: (process.env.SMTP_PORT ?? "465") === "465",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});
