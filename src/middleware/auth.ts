import { Request, Response, NextFunction } from 'express';
import { verifyJwt, COOKIE_NAME } from '../utils/jwt.js';
import { pool } from '../config/db.js';

export interface AuthedRequest extends Request {
  user?: { id: string; role: string };
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const bearer = req.headers.authorization?.toString();
  const headerToken = bearer && bearer.startsWith('Bearer ') ? bearer.substring(7) : undefined;
  const token = headerToken || req.cookies?.[COOKIE_NAME];
  if (!token) return res.status(401).json({ error: 'unauthorized' });
  const payload = verifyJwt(token);
  if (!payload) return res.status(401).json({ error: 'invalid_token' });
  // Ensure user exists in DB to avoid stale/memory-only tokens
  (async () => {
    try {
      const [rows] = await pool.query<any[]>(`SELECT id FROM users WHERE id=? LIMIT 1`, [payload.id]);
      if (!Array.isArray(rows) || rows.length === 0) {
        // Clear cookie if present to force re-login
        if (req.cookies?.[COOKIE_NAME]) res.clearCookie(COOKIE_NAME, { path: '/' });
        return res.status(401).json({ error: 'invalid_user' });
      }
      req.user = { id: String((rows as any)[0].id), role: payload.role };
      next();
    } catch {
      // On DB error, fail closed rather than allowing actions without a valid user
      return res.status(500).json({ error: 'auth_check_failed' });
    }
  })();
}

export function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ error: 'unauthorized' });
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'forbidden' });
  next();
}
