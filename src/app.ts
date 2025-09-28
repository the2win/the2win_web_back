import express from 'express';
import cors from 'cors';
import { corsMiddleware } from './config/cors.js';
import helmet from 'helmet';
import authRoutes from './routes/authRoutes';
import walletRoutes from './routes/walletRoutes';
import gameRoutes from './routes/gameRoutes';
import crashRoutes from './routes/crashRoutes';
import wingoRoutes from './routes/wingoRoutes';
import boxesRoutes from './routes/boxesRoutes';
import adminRoutes from './routes/adminRoutes';
import path from 'path';
import fs from 'fs';
import { errorHandler } from './middleware/errorHandler';
import { rateLimit } from './middleware/rateLimit';

export const app = express();
app.use(helmet());
app.use(corsMiddleware);
app.use(express.json());
// Static files (receipts)
const uploadsDir = path.resolve(process.cwd(), 'uploads');
try { if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true }); } catch {}
app.use('/uploads', express.static(uploadsDir));

app.get('/health', rateLimit, (_req, res) => res.json({ status: 'ok' }));
app.use('/api/auth', rateLimit, authRoutes);
app.use('/api/wallet', rateLimit, walletRoutes);
app.use('/api/games', rateLimit, gameRoutes);
app.use('/api/crash', rateLimit, crashRoutes);
app.use('/api/wingo', rateLimit, wingoRoutes);
app.use('/api/boxes', rateLimit, boxesRoutes);
app.use('/api/admin', rateLimit, adminRoutes);

app.use(errorHandler);
