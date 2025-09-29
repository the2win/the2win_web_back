import dotenv from 'dotenv';

dotenv.config();

export const ENV = {
  PORT: process.env.PORT || '4000',
  JWT_SECRET: process.env.JWT_SECRET || 'dev_jwt_secret_change_me',
  OTP_EXP_MIN: parseInt(process.env.OTP_EXP_MIN || '10', 10),
  DATABASE_URL: process.env.DATABASE_URL || process.env.MYSQL_URL || process.env.DB_URL,
  DB_HOST: process.env.DB_HOST || 'localhost',
  DB_PORT: parseInt(process.env.DB_PORT || '3306', 10),
  DB_USER: process.env.DB_USER || 'root',
  DB_PASSWORD: process.env.DB_PASSWORD || '',
  DB_NAME: process.env.DB_NAME || 'the2win',
  ADMIN_EMAIL: process.env.ADMIN_EMAIL || 'admin@the2win.local',
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || 'ChangeThisAdminPass123!',
  ADMIN_FORCE_RESET: (process.env.ADMIN_FORCE_RESET || 'false').toLowerCase() === 'true',
  SMTP_HOST: process.env.SMTP_HOST || '',
  SMTP_PORT: parseInt(process.env.SMTP_PORT || '587', 10),
  SMTP_SECURE: (process.env.SMTP_SECURE || 'false').toLowerCase() === 'true',
  SMTP_USER: process.env.SMTP_USER || '',
  SMTP_PASS: process.env.SMTP_PASS || '',
  SMTP_FROM: process.env.SMTP_FROM || process.env.SMTP_USER || ''
};
