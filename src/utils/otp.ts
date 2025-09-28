import { ENV } from '../config/env.js';

export function generateOtp(): { code: string; expiresAt: number } {
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  return { code, expiresAt: Date.now() + ENV.OTP_EXP_MIN * 60 * 1000 };
}
