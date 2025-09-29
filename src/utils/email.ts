import nodemailer from 'nodemailer';
import { ENV } from '../config/env.js';

let transporter: nodemailer.Transporter | null = null;
function getTransporter() {
  if (transporter) return transporter;
  if (!ENV.SMTP_HOST || !ENV.SMTP_USER) return null;
  transporter = nodemailer.createTransport({
    host: ENV.SMTP_HOST,
    port: ENV.SMTP_PORT,
    secure: ENV.SMTP_SECURE,
    auth: { user: ENV.SMTP_USER, pass: ENV.SMTP_PASS },
  } as any);
  return transporter;
}

export async function sendEmail(to: string, subject: string, text: string) {
  const t = getTransporter();
  if (!t) {
    // Dev fallback
    console.log(`[EMAIL:DEV] to=${to} subject=${subject} text=${text}`);
    return;
  }
  const from = ENV.SMTP_FROM || ENV.SMTP_USER;
  await t.sendMail({ from, to, subject, text });
}
