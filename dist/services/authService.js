import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { nanoid } from 'nanoid';
import { db } from '../models/memoryDB.js';
import { pool } from '../config/db.js';
import { User } from '../models/index.js';
import { signJwt } from '../utils/jwt.js';
async function findUserByEmail(email) {
    // Prefer direct MySQL first for consistent schema mapping across environments
    try {
        const [rows] = await pool.query(`SELECT id,email,password_hash AS passwordHash,balance,role FROM users WHERE email=? LIMIT 1`, [email]);
        if (Array.isArray(rows) && rows.length) {
            const r = rows[0];
            let pass = r.passwordHash;
            // If password_hash is null/empty, try legacy `password` column
            if (!pass) {
                try {
                    const [rows2] = await pool.query(`SELECT password AS legacyPass FROM users WHERE id=? LIMIT 1`, [r.id]);
                    if (Array.isArray(rows2) && rows2.length && rows2[0].legacyPass)
                        pass = rows2[0].legacyPass;
                }
                catch { }
            }
            const u = {
                id: String(r.id ?? ''),
                email: String(r.email ?? ''),
                passwordHash: String(pass || ''),
                balance: Number(r.balance ?? 0),
            };
            // OTP columns might not exist on this DB; handled elsewhere when needed
            return u;
        }
    }
    catch {
        // ignore and try Sequelize then memory
    }
    // Fallback to Sequelize ORM
    try {
        const u = await User.findOne({ where: { email } });
        if (u) {
            const obj = {
                id: u.id,
                email: u.email,
                passwordHash: u.passwordHash,
                balance: Number(u.balance),
            };
            if (u.otpCode && u.otpExpiresAt)
                obj.otp = { code: u.otpCode, expiresAt: u.otpExpiresAt };
            return obj;
        }
    }
    catch { }
    // In-memory last resort
    return db.users.find(u => u.email === email);
}
async function insertUserAndReturn(email, passwordHash) {
    // Try via Sequelize first (without providing id so DB can auto-assign if using AUTO_INCREMENT)
    try {
        const created = await User.create({ email, passwordHash, balance: 0 });
        const id = String(created.id);
        const balance = Number(created.balance ?? 0);
        return { id, email, passwordHash, balance };
    }
    catch { }
    // Try raw SQL (use auto-increment id)
    try {
        const [result] = await pool.query(`INSERT INTO users (email, password_hash, balance, created_at, updated_at) VALUES (?,?,?, NOW(), NOW())`, [email, passwordHash, 0]);
        const insertId = String(result?.insertId ?? '');
        if (insertId)
            return { id: insertId, email, passwordHash, balance: 0 };
    }
    catch {
        // Fallback attempt without updated_at column (older schema)
        try {
            const [result] = await pool.query(`INSERT INTO users (email, password_hash, balance, created_at) VALUES (?,?,?, NOW())`, [email, passwordHash, 0]);
            const insertId = String(result?.insertId ?? '');
            if (insertId)
                return { id: insertId, email, passwordHash, balance: 0 };
        }
        catch { }
    }
    // Memory fallback (opt-in via env) to avoid false success in production
    const allowMemory = (process.env.USE_MEMORY_DB || '').toLowerCase() === 'true';
    if (allowMemory) {
        const id = nanoid();
        const user = { id, email, passwordHash, balance: 0 };
        db.users.push(user);
        return user;
    }
    throw new Error('Failed to create user account');
}
async function updatePassword(userId, passwordHash) {
    try {
        await User.update({ passwordHash }, { where: { id: userId } });
        return;
    }
    catch { }
    try {
        await pool.query(`UPDATE users SET password_hash=? WHERE id=?`, [passwordHash, userId]);
    }
    catch {
        const u = db.users.find(u => u.id === userId);
        if (u)
            u.passwordHash = passwordHash;
    }
}
async function storeOtp(userId, code, expiresAt) {
    try {
        await User.update({ otpCode: code, otpExpiresAt: expiresAt }, { where: { id: userId } });
        return;
    }
    catch { }
    try {
        await pool.query(`UPDATE users SET otp_code=?, otp_expires_at=? WHERE id=?`, [code, expiresAt, userId]);
    }
    catch {
        const u = db.users.find(u => u.id === userId);
        if (u)
            u.otp = { code, expiresAt };
    }
}
async function clearOtp(userId) {
    try {
        await pool.query(`UPDATE users SET otp_code=NULL, otp_expires_at=NULL WHERE id=?`, [userId]);
    }
    catch { /* ignore */ }
    const u = db.users.find(u => u.id === userId);
    if (u)
        delete u.otp;
}
export async function register(email, password) {
    const existing = await findUserByEmail(email);
    if (existing)
        throw new Error('Email already registered');
    const passwordHash = await bcrypt.hash(password, 10);
    const created = await insertUserAndReturn(email, passwordHash);
    return created;
}
export async function login(email, password) {
    const user = await findUserByEmail(email);
    if (!user) {
        console.warn('[auth] login failed: user not found for email');
        const err = new Error('Invalid credentials');
        err.status = 401;
        err.debug = { stage: 'user_not_found', email };
        throw err;
    }
    // Guard against missing/invalid password hashes and ensure compare failures do not bubble as 500s
    let ok = false;
    let debugInfo = { stage: 'init' };
    try {
        if (user.passwordHash) {
            // Normalize common legacy bcrypt prefixes from PHP ($2y, $2x) and trim any whitespace
            const raw = String(user.passwordHash || '');
            const trimmed = raw.trim();
            const normalized = trimmed.startsWith('$2y$') || trimmed.startsWith('$2x$')
                ? ('$2a$' + trimmed.slice(4))
                : trimmed;
            const dbg = (process.env.AUTH_DEBUG || '').toLowerCase() === 'true';
            if (dbg) {
                console.log('[auth][dbg] user id/email:', user.id, email);
                console.log('[auth][dbg] hash len:', normalized.length, 'prefix:', normalized.slice(0, 4));
            }
            ok = await bcrypt.compare(password, normalized);
            if (dbg)
                console.log('[auth][dbg] bcrypt.compare =>', ok);
            debugInfo = { stage: 'bcrypt_compare', ok, hashLen: normalized.length, hashPrefix: normalized.slice(0, 4) };
            // If comparison succeeded using a normalized legacy variant, upgrade to a fresh modern hash
            if (ok && normalized !== trimmed) {
                try {
                    const upgraded = await bcrypt.hash(password, 10);
                    await updatePassword(user.id, upgraded);
                }
                catch {
                    // non-fatal; continue
                }
            }
        }
    }
    catch {
        ok = false;
        debugInfo = { stage: 'bcrypt_error' };
    }
    // Optional legacy support: if stored "hash" appears to be plaintext and matches, upgrade to bcrypt
    if (!ok) {
        try {
            const looksHashed = typeof user.passwordHash === 'string' && user.passwordHash.startsWith('$2');
            if (!looksHashed && user.passwordHash && user.passwordHash === password) {
                const newHash = await bcrypt.hash(password, 10);
                await updatePassword(user.id, newHash);
                ok = true;
                if ((process.env.AUTH_DEBUG || '').toLowerCase() === 'true')
                    console.log('[auth][dbg] plaintext password matched; upgraded to bcrypt');
                debugInfo = { stage: 'plaintext_upgrade' };
            }
        }
        catch {
            // ignore and fall through to invalid creds
        }
    }
    // Legacy hash formats support (md5/sha1/sha256), upgrade on successful match
    if (!ok) {
        try {
            const stored = String(user.passwordHash || '').trim().toLowerCase();
            if (stored && !stored.startsWith('$2')) {
                const md5 = crypto.createHash('md5').update(password, 'utf8').digest('hex');
                const sha1 = crypto.createHash('sha1').update(password, 'utf8').digest('hex');
                const sha256 = crypto.createHash('sha256').update(password, 'utf8').digest('hex');
                const candidates = new Set();
                candidates.add(md5);
                candidates.add(sha1);
                candidates.add(sha256);
                // Some systems store with prefixes like md5:xxxx or sha1$xxxx
                const normalizedStored = stored.replace(/^(md5|sha1|sha256)[:$]/, '');
                if (candidates.has(normalizedStored)) {
                    const upgraded = await bcrypt.hash(password, 10);
                    await updatePassword(user.id, upgraded);
                    ok = true;
                    if ((process.env.AUTH_DEBUG || '').toLowerCase() === 'true')
                        console.log('[auth][dbg] legacy digest matched; upgraded to bcrypt');
                    debugInfo = { stage: 'legacy_digest_upgrade' };
                }
            }
        }
        catch {
            // ignore
        }
    }
    if (!ok) {
        console.warn('[auth] login failed: password mismatch for email');
        if ((process.env.AUTH_DEBUG || '').toLowerCase() === 'true') {
            console.warn('[auth][dbg] mismatch for', email);
        }
        const err = new Error('Invalid credentials');
        err.status = 401;
        err.debug = debugInfo;
        throw err;
    }
    // Fetch role for payload
    let role = 'user';
    try {
        const [rows] = await pool.query(`SELECT role FROM users WHERE id=?`, [user.id]);
        if (Array.isArray(rows) && rows.length && rows[0].role)
            role = rows[0].role;
    }
    catch { }
    const token = signJwt({ id: String(user.id), role }, '1d');
    return { token, user: { id: user.id, email: user.email, balance: user.balance, role } };
}
export function createOtp(user, code, expiresAt) {
    storeOtp(user.id, code, expiresAt);
}
export function verifyOtp(user, code) {
    if (!user.otp)
        return false;
    if (Date.now() > user.otp.expiresAt)
        return false;
    return user.otp.code === code;
}
export async function resetPassword(user, newPassword) {
    const hash = await bcrypt.hash(newPassword, 10);
    await updatePassword(user.id, hash);
    await clearOtp(user.id);
}
