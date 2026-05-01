import * as nodemailer from "nodemailer";
import { Resend } from 'resend';
import * as dotenv from 'dotenv';

dotenv.config();

const resendApiKey = process.env.RESEND_API_KEY;
export const resend = resendApiKey ? new Resend(resendApiKey) : null;

export const transporter = nodemailer.createTransport({
  host: "smtp.hostinger.com",
  port: 465,
  secure: true,
  auth: {
    user: "aamaro@axzy.dev",
    pass: "martin@M070208",
  },
});
