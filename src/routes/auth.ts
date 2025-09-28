import { Router } from 'express';
import { pool } from '../config/db.js';
import bcrypt from 'bcryptjs';
import { signJwt, COOKIE_NAME } from '../utils/jwt.js';
import { requireAuth, AuthedRequest } from '../middleware/auth.js';
import { RowDataPacket } from 'mysql2';

const router = Router();

router.post('/register', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'missing_fields' });
  const [existing] = await pool.query('SELECT id FROM users WHERE email=?', [email]);
  if ((existing as RowDataPacket[]).length) return res.status(409).json({ error: 'email_taken' });
  const hash = await bcrypt.hash(password, 10);
  const [result] = await pool.query('INSERT INTO users (email, password_hash, created_at, updated_at) VALUES (?,?, NOW(), NOW())', [email, hash]);
  const id = (result as any).insertId as number;
  const token = signJwt({ id: String(id), role: 'user' });
  res.cookie(COOKIE_NAME, token, { httpOnly: true, sameSite: 'lax' });
  res.json({ id, email, role: 'user', balance: 0 });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'missing_fields' });
  const [rows] = await pool.query('SELECT id, password_hash, role, balance FROM users WHERE email=?', [email]);
  const user = (rows as RowDataPacket[])[0];
  if (!user) return res.status(401).json({ error: 'invalid_credentials' });
  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) return res.status(401).json({ error: 'invalid_credentials' });
  const token = signJwt({ id: String(user.id), role: user.role });
  res.cookie(COOKIE_NAME, token, { httpOnly: true, sameSite: 'lax' });
  res.json({ id: user.id, email, role: user.role, balance: user.balance });
});

router.post('/logout', (_req, res) => {
  res.clearCookie(COOKIE_NAME);
  res.json({ ok: true });
});

router.get('/me', requireAuth, async (req: AuthedRequest, res) => {
  const [rows] = await pool.query('SELECT id, email, role, balance FROM users WHERE id=?', [req.user!.id]);
  const user = (rows as RowDataPacket[])[0];
  if (!user) return res.status(404).json({ error: 'not_found' });
  res.json(user);
});

export default router;
