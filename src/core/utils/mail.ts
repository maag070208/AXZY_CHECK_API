import * as nodemailer from "nodemailer";

export const transporter = nodemailer.createTransport({
  host: "smtp.hostinger.com",
  port: 465,
  secure: true,
  requireTLS: true,
  tls: {
    ciphers: "SSLv3",
  },
  connectionTimeout: 5000,
  auth: {
    user: "aamaro@axzy.dev",
    pass: "martin@M070208",
  },
});
