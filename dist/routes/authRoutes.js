import { Router } from 'express';
import { z } from 'zod';
import { register, login, createOtp, verifyOtp, resetPassword } from '../services/authService.js';
import { COOKIE_NAME, verifyJwt } from '../utils/jwt.js';
import { pool } from '../config/db.js';
import { db } from '../models/memoryDB.js';
import { generateOtp } from '../utils/otp.js';
import { sendEmail } from '../utils/email.js';
import { ENV } from '../config/env.js';
const router = Router();
const credSchema = z.object({
    email: z.string().trim().toLowerCase().email('Please enter a valid email address'),
    password: z.string().min(8, 'Password must be at least 8 characters')
        .regex(/^(?=.*[A-Za-z])(?=.*\d).+$/, 'Password must include letters and numbers')
});
router.post('/register', async (req, res, next) => {
    try {
        const { email, password } = credSchema.parse(req.body);
        const user = await register(email, password);
        res.json({ id: user.id, email: user.email });
    }
    catch (e) {
        next(e);
    }
});
router.post('/login', async (req, res, next) => {
    try {
        const { email, password } = credSchema.parse(req.body);
        const { token, user } = await login(email, password);
        // set httpOnly cookie for session-style auth
        res.cookie(COOKIE_NAME, token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 24 * 60 * 60 * 1000,
            path: '/',
        });
        res.json({ token, user });
    }
    catch (e) {
        next(e);
    }
});
// Return current session user (via cookie or bearer)
router.get('/me', async (req, res) => {
    const bearer = req.headers.authorization?.toString();
    const headerToken = bearer && bearer.startsWith('Bearer ') ? bearer.substring(7) : undefined;
    const token = headerToken || req.cookies?.[COOKIE_NAME];
    if (!token)
        return res.status(401).json({ error: 'unauthorized' });
    const payload = verifyJwt(token);
    if (!payload)
        return res.status(401).json({ error: 'invalid_token' });
    try {
        const [rows] = await pool.query(`SELECT id,email,role,balance FROM users WHERE id=? LIMIT 1`, [payload.id]);
        if (!Array.isArray(rows) || !rows.length)
            return res.status(404).json({ error: 'not_found' });
        const u = rows[0];
        return res.json({ user: { id: String(u.id), email: u.email, role: u.role, balance: Number(u.balance) } });
    }
    catch (e) {
        return res.status(500).json({ error: 'server_error' });
    }
});
router.post('/logout', (req, res) => {
    res.clearCookie(COOKIE_NAME, { path: '/' });
    res.json({ ok: true });
});
router.post('/forgot-password', async (req, res, next) => {
    try {
        const { email } = z.object({ email: z.string().email() }).parse(req.body);
        const user = db.users.find(u => u.email === email);
        if (!user)
            return res.json({ message: 'If account exists OTP sent' });
        const { code, expiresAt } = generateOtp();
        createOtp(user, code, expiresAt);
        await sendEmail(email, 'Your OTP Code', `Code: ${code} (valid ${ENV.OTP_EXP_MIN} minutes)`);
        res.json({ message: 'OTP sent' });
    }
    catch (e) {
        next(e);
    }
});
router.post('/verify-otp', async (req, res, next) => {
    try {
        const { email, code } = z.object({ email: z.string().email(), code: z.string() }).parse(req.body);
        const user = db.users.find(u => u.email === email);
        if (!user)
            return res.status(400).json({ message: 'Invalid code' });
        const ok = verifyOtp(user, code);
        if (!ok)
            return res.status(400).json({ message: 'Invalid or expired code' });
        res.json({ message: 'OTP valid' });
    }
    catch (e) {
        next(e);
    }
});
router.post('/reset-password', async (req, res, next) => {
    try {
        const { email, code, newPassword } = z.object({
            email: z.string().email(),
            code: z.string().min(4),
            newPassword: z.string().min(8)
                .regex(/^(?=.*[A-Za-z])(?=.*\d).+$/, 'Password must include letters and numbers')
        }).parse(req.body);
        const user = db.users.find(u => u.email === email);
        if (!user || !verifyOtp(user, code))
            return res.status(400).json({ message: 'Invalid request' });
        await resetPassword(user, newPassword);
        res.json({ message: 'Password updated' });
    }
    catch (e) {
        next(e);
    }
});
export default router;
