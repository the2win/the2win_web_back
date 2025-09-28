import express from 'express';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import cors, { CorsOptions } from 'cors';
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
import fs from 'fs';
import path from 'path';

dotenv.config();

const app = express();
app.use(cookieParser());

// CORS configuration (allowlist via env CORS_ORIGINS, comma-separated)
const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:3000,http://localhost:5173')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

const corsOptions: CorsOptions = {
  origin: (origin, callback) => {
    // Allow non-browser requests or same-origin requests without an Origin header
    if (!origin) return callback(null, true);
    // Allow all if '*' present, else check explicit allowlist
    if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
  exposedHeaders: ['Content-Length'],
  maxAge: 600,
};

app.use(cors(corsOptions));
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
