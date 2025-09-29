import bcrypt from 'bcryptjs';
import { nanoid } from 'nanoid';
import { db } from '../models/memoryDB.js';
import { pool } from '../config/db.js';
import { User } from '../models/index.js';
import { signJwt } from '../utils/jwt.js';
async function findUserByEmail(email) {
    // Try Sequelize first
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
    // Raw SQL fallback (and legacy columns support)
    try {
        const [rows] = await pool.query(`SELECT id,email,password_hash as passwordHash,balance,role,otp_code as otpCode, otp_expires_at as otpExpires FROM users WHERE email=? LIMIT 1`, [email]);
        if (!Array.isArray(rows) || rows.length === 0)
            return undefined;
        const r = rows[0];
        let pass = r.passwordHash;
        // If password_hash is null/empty, try legacy `password` column
        if (!pass) {
            try {
                const [rows2] = await pool.query(`SELECT password as legacyPass FROM users WHERE id=? LIMIT 1`, [r.id]);
                if (Array.isArray(rows2) && rows2.length && rows2[0].legacyPass)
                    pass = rows2[0].legacyPass;
            }
            catch { }
        }
        const u = { id: String(r.id), email: r.email, passwordHash: pass || '', balance: Number(r.balance) };
        if (r.otpCode && r.otpExpires)
            u.otp = { code: r.otpCode, expiresAt: r.otpExpires };
        return u;
    }
    catch {
        return db.users.find(u => u.email === email);
    }
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
        const err = new Error('Invalid credentials');
        err.status = 401;
        throw err;
    }
    // Compare bcrypt if possible
    let ok = false;
    try {
        if (user.passwordHash)
            ok = await bcrypt.compare(password, user.passwordHash);
    }
    catch { ok = false; }
    // Optional legacy support: if stored value appears plaintext and matches, upgrade to bcrypt
    if (!ok) {
        try {
            const looksHashed = typeof user.passwordHash === 'string' && user.passwordHash.startsWith('$2');
            if (!looksHashed && user.passwordHash && user.passwordHash === password) {
                const newHash = await bcrypt.hash(password, 10);
                await updatePassword(user.id, newHash);
                ok = true;
            }
        }
        catch { /* ignore */ }
    }
    if (!ok) {
        const err = new Error('Invalid credentials');
        err.status = 401;
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
