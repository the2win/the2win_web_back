import express from 'express';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { ping } from './config/db.js';
import authRouter from './routes/authRoutes.js';
import walletRouter from './routes/walletRoutes.js';
import crashRoutes from './routes/crashRoutes.js';
import boxesRoutes from './routes/boxesRoutes.js';
import wingoRoutes from './routes/wingoRoutes.js';
import gameRoutes from './routes/gameRoutes.js';
import { initSequelize, ensureDatabase } from './config/sequelize.js';
import { ensureAdminAccount } from './utils/adminBootstrap.js';
import adminRoutes from './routes/adminRoutes.js';
import { migrate } from './scripts/migrate.js';
import { errorHandler } from './middleware/errorHandler.js';
import { runFixLegacyPasswords } from './scripts/fixLegacyPasswords.js';
import fs from 'fs';
import path from 'path';

dotenv.config();

const app = express();
// Behind Cloud Run/Proxies ensure correct protocol info for cookies, redirects, etc.
app.set('trust proxy', 1);
app.use(cookieParser());

// CORS configuration (allowlist via env CORS_ORIGINS, comma-separated)
// Always include safe defaults in addition to env-provided values.
const defaultOrigins = 'http://localhost:3000,http://localhost:5173,https://*.vercel.app';
const allowedOrigins = (process.env.CORS_ORIGINS
  ? `${process.env.CORS_ORIGINS},${defaultOrigins}`
  : defaultOrigins)
  .split(',')
  .map(s => s.trim())
  .filter(Boolean)
  // de-duplicate while preserving order
  .filter((v, i, a) => a.indexOf(v) === i);

// Allow exact matches and simple wildcard patterns like https://*.vercel.app
function isOriginAllowed(origin: string): boolean {
  if (!origin) return true;
  if (allowedOrigins.includes('*')) return true;
  if (allowedOrigins.includes(origin)) return true;
  // Match wildcard patterns
  for (const pat of allowedOrigins) {
    if (!pat.includes('*')) continue;
    // Escape regex special chars except '*', then replace '*' with '.*'
    const regex = new RegExp('^' + pat
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*') + '$');
    if (regex.test(origin)) return true;
  }
  return false;
}

import { corsMiddleware, corsOptions } from './config/cors.js';

app.use(corsMiddleware);
app.options('*', cors(corsOptions));
app.use(express.json());

// Static files for uploaded receipts
try {
  const uploadsDir = path.resolve(process.cwd(), 'uploads');
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
  app.use('/uploads', express.static(uploadsDir));
} catch {}

app.get('/health', async (_req, res) => {
  try {
    await ping();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: (e as Error).message });
  }
});

app.get('/', (_req, res) => {
  res.json({ service: 'the2win-backend', status: 'running' });
});

// API prefix
app.use('/api/auth', authRouter);
app.use('/api/wallet', walletRouter);
app.use('/api/crash', crashRoutes);
app.use('/api/boxes', boxesRoutes);
app.use('/api/wingo', wingoRoutes);
app.use('/api/games', gameRoutes);
app.use('/api/admin', adminRoutes);

// Global error handler (must be after routes)
app.use(errorHandler);

async function start() {
  try {
    // Ensure database exists before applying migrations
    await ensureDatabase();
  } catch (e) {
    console.error('Ensure database failed:', (e as Error).message);
  }
  try {
    // Ensure SQL migrations are applied before ORM sync and bootstrap
    await migrate();
  } catch (e) {
    console.error('Migrations failed:', (e as Error).message);
  }
  try {
    await initSequelize();
  } catch (e) {
    console.error('Sequelize init failed:', (e as Error).message);
  }
  // Optional one-time legacy passwords fix
  try {
    if ((process.env.FIX_LEGACY_PASSWORDS || 'false').toLowerCase() === 'true') {
      await runFixLegacyPasswords();
    }
  } catch (e) {
    console.error('Legacy password fix failed:', (e as Error).message);
  }
  // Auto-create admin on startup if env provided
  const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@the2win.local';
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'ChangeThisAdminPass123!';
  const ADMIN_FORCE_RESET = (process.env.ADMIN_FORCE_RESET || 'false').toLowerCase() === 'true';
  try {
    await ensureAdminAccount({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD, forceReset: ADMIN_FORCE_RESET });
  } catch (e) {
    console.error('Admin bootstrap failed:', (e as Error).message);
  }
  const port = Number(process.env.PORT || 4000);
  app.listen(port, () => {
    console.log(`Backend listening on :${port}`);
  });
}

start();
