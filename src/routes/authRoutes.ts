import { Router } from 'express';
import { z } from 'zod';
import { register, login, createOtp, verifyOtp, resetPassword } from '../services/authService.js';
import { COOKIE_NAME, verifyJwt } from '../utils/jwt.js';
import { pool } from '../config/db.js';
import { db } from '../models/memoryDB.js';
import { generateOtp } from '../utils/otp.js';
import { sendEmail } from '../utils/email.js';
import { ENV } from '../config/env.js';
import { User } from '../models/index.js';

const router = Router();

// Strong rules for registration
const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email('Please enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters')
    .regex(/^(?=.*[A-Za-z])(?=.*\d).+$/, 'Password must include letters and numbers')
});
// More permissive for login to support legacy accounts; real check happens against stored hash
const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Please enter a valid email address'),
  password: z.string().min(1, 'Password is required')
});

router.post('/register', async (req, res, next) => {
  try {
    const { email, password } = registerSchema.parse(req.body);
    const user = await register(email, password);
    // After creation, log in and set cookie
    const { token, user: userObj } = await login(email, password);
    const isProd = process.env.NODE_ENV === 'production';
    const cookieDomain = process.env.COOKIE_DOMAIN || undefined;
    res.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? 'none' : 'lax',
      maxAge: 24 * 60 * 60 * 1000,
      path: '/',
      domain: cookieDomain,
    });
    res.json({ token, user: userObj });
  } catch (e: any) { next(e); }
});

router.post('/login', async (req, res, next) => {
  try {
    // Accept existing valid cookie as an already-authenticated session
    const cookieToken = (req as any).cookies?.[COOKIE_NAME];
    if (cookieToken) {
      const payload = verifyJwt(cookieToken);
      if (payload) {
        try {
          const [rows] = await pool.query<any[]>(`SELECT id,email,role,balance FROM users WHERE id=? LIMIT 1`, [payload.id]);
          if (Array.isArray(rows) && rows.length) {
            const u = rows[0];
            return res.json({ token: cookieToken, user: { id: String(u.id), email: u.email, role: u.role, balance: Number(u.balance) } });
          }
        } catch {}
      }
    }

    const { email, password } = loginSchema.parse(req.body);
    const { token, user } = await login(email, password);
    // set httpOnly cookie for session-style auth
    const isProd = process.env.NODE_ENV === 'production';
    const cookieDomain = process.env.COOKIE_DOMAIN || undefined; // e.g. your apex domain if needed
    res.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      secure: isProd, // required for SameSite=None on modern browsers
      sameSite: isProd ? 'none' : 'lax', // cross-site with frontend on different domain
      maxAge: 24 * 60 * 60 * 1000,
      path: '/',
      domain: cookieDomain,
    });
    res.json({ token, user });
  } catch (e: any) { next(e); }
});

// Return current session user (via cookie or bearer)
router.get('/me', async (req, res) => {
  const bearer = req.headers.authorization?.toString();
  const headerToken = bearer && bearer.startsWith('Bearer ') ? bearer.substring(7) : undefined;
  const token = headerToken || (req as any).cookies?.[COOKIE_NAME];
  if (!token) return res.status(401).json({ error: 'unauthorized' });
  const payload = verifyJwt(token);
  if (!payload) return res.status(401).json({ error: 'invalid_token' });
  try {
    const [rows] = await pool.query<any[]>(`SELECT id,email,role,balance FROM users WHERE id=? LIMIT 1`, [payload.id]);
    if (!Array.isArray(rows) || !rows.length) return res.status(404).json({ error: 'not_found' });
    const u = rows[0];
    return res.json({ user: { id: String(u.id), email: u.email, role: u.role, balance: Number(u.balance) } });
  } catch (e) {
    return res.status(500).json({ error: 'server_error' });
  }
});

router.post('/logout', (req, res) => {
  const isProd = process.env.NODE_ENV === 'production';
  const cookieDomain = process.env.COOKIE_DOMAIN || undefined;
  res.clearCookie(COOKIE_NAME, {
    path: '/',
    domain: cookieDomain,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax'
  });
  res.json({ ok: true });
});

router.post('/forgot-password', async (req, res, next) => {
  try {
    const { email } = z.object({ email: z.string().email() }).parse(req.body);
    let user: any = undefined;
    try {
      const u = await User.findOne({ where: { email } });
      if (u) user = { id: String(u.id), email: u.email };
    } catch {}
    if (!user) {
      try {
        const [rows] = await pool.query<any[]>(`SELECT id,email FROM users WHERE email=? LIMIT 1`, [email]);
        if (Array.isArray(rows) && rows.length) user = { id: String(rows[0].id), email: rows[0].email };
      } catch {}
    }
    if (!user) user = db.users.find(u => u.email === email);
    if (!user) return res.json({ message: 'If account exists OTP sent' });
    const { code, expiresAt } = generateOtp();
    createOtp(user, code, expiresAt);
    await sendEmail(email, 'Your OTP Code', `Code: ${code} (valid ${ENV.OTP_EXP_MIN} minutes)`);
    res.json({ message: 'OTP sent' });
  } catch (e: any) { next(e); }
});

router.post('/verify-otp', async (req, res, next) => {
  try {
    const { email, code } = z.object({ email: z.string().email(), code: z.string() }).parse(req.body);
    let user: any = undefined;
    try {
      const [rows] = await pool.query<any[]>(`SELECT id,email,otp_code as otpCode, otp_expires_at as otpExpires FROM users WHERE email=? LIMIT 1`, [email]);
      if (Array.isArray(rows) && rows.length) user = { id: String(rows[0].id), email: rows[0].email, otp: { code: rows[0].otpCode, expiresAt: Number(rows[0].otpExpires) } };
    } catch {}
    if (!user) user = db.users.find(u => u.email === email);
    if (!user) return res.status(400).json({ message: 'Invalid code' });
    const ok = verifyOtp(user, code);
    if (!ok) return res.status(400).json({ message: 'Invalid or expired code' });
    res.json({ message: 'OTP valid' });
  } catch (e: any) { next(e); }
});

router.post('/reset-password', async (req, res, next) => {
  try {
    const { email, code, newPassword } = z.object({
      email: z.string().email(),
      code: z.string().min(4),
      newPassword: z.string().min(8)
        .regex(/^(?=.*[A-Za-z])(?=.*\d).+$/, 'Password must include letters and numbers')
    }).parse(req.body);
    let user: any = undefined;
    try {
      const [rows] = await pool.query<any[]>(`SELECT id,email,otp_code as otpCode, otp_expires_at as otpExpires FROM users WHERE email=? LIMIT 1`, [email]);
      if (Array.isArray(rows) && rows.length) user = { id: String(rows[0].id), email: rows[0].email, otp: { code: rows[0].otpCode, expiresAt: Number(rows[0].otpExpires) } };
    } catch {}
    if (!user) user = db.users.find(u => u.email === email);
    if (!user || !verifyOtp(user, code)) return res.status(400).json({ message: 'Invalid request' });
    await resetPassword(user, newPassword);
    res.json({ message: 'Password updated' });
  } catch (e: any) { next(e); }
});

export default router;
