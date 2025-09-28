import { pool } from '../config/db.js';
import bcrypt from 'bcryptjs';
function mask(str) {
    if (!str)
        return '';
    if (str.length <= 4)
        return '****';
    return `${'*'.repeat(Math.max(0, str.length - 4))}${str.slice(-4)}`;
}
export async function ensureAdminAccount(opts) {
    const email = opts.email.trim().toLowerCase();
    const password = opts.password;
    const forceReset = !!opts.forceReset;
    if (!email || !password) {
        console.warn('[adminBootstrap] Skipping admin creation due to missing email/password');
        return;
    }
    try {
        // Try find by email first, else any existing admin
        const [rowsByEmail] = await pool.query(`SELECT id, email, role, password_hash AS passwordHash, balance FROM users WHERE email=? LIMIT 1`, [email]);
        let existing = Array.isArray(rowsByEmail) && rowsByEmail.length ? rowsByEmail[0] : undefined;
        if (!existing) {
            const [rowsAnyAdmin] = await pool.query(`SELECT id, email, role, password_hash AS passwordHash, balance FROM users WHERE role='admin' LIMIT 1`);
            if (Array.isArray(rowsAnyAdmin) && rowsAnyAdmin.length)
                existing = rowsAnyAdmin[0];
        }
        if (existing) {
            const updates = [];
            const params = [];
            // Ensure role is admin (handles NULL or wrong role)
            if (existing.role !== 'admin') {
                updates.push('role="admin"');
            }
            // Ensure email is set; if missing/NULL/empty, set to provided email
            if (!existing.email) {
                updates.push('email=?');
                params.push(email);
            }
            // Ensure balance not NULL
            if (existing.balance == null) {
                updates.push('balance=0');
            }
            // Reset password if forced or currently NULL
            if (forceReset || !existing.passwordHash) {
                const hash = await bcrypt.hash(password, 10);
                updates.push('password_hash=?');
                params.push(hash);
            }
            if (updates.length) {
                params.push(existing.id);
                // ensure updated_at
                const setClause = updates.concat(['updated_at=NOW()']).join(', ');
                await pool.query(`UPDATE users SET ${setClause} WHERE id=?`, params);
                console.log(`[adminBootstrap] Updated admin record (id=${existing.id}) for ${email} (forceReset=${forceReset})`);
            }
            else {
                console.log(`[adminBootstrap] Admin already present and healthy: ${existing.email || email}`);
            }
            return;
        }
    }
    catch (e) {
        console.warn('[adminBootstrap] Lookup failed, will attempt insert anyway:', e?.message || e);
    }
    // Create new admin
    const password_hash = await bcrypt.hash(password, 10);
    try {
        await pool.query('INSERT INTO users (email, password_hash, role, balance, created_at, updated_at) VALUES (?, ?, "admin", 0, NOW(), NOW())', [email, password_hash]);
        console.log(`[adminBootstrap] Admin created: ${email} / ${mask(password)}`);
        return;
    }
    catch (e) {
        const msg = e?.sqlMessage || e?.message || '';
        // Fallback: if id lacks AUTO_INCREMENT default, insert with explicit id
        if (msg.includes("doesn't have a default value") && msg.includes('id')) {
            const [maxRows] = await pool.query('SELECT COALESCE(MAX(id),0)+1 AS nextId FROM users');
            const nextId = Array.isArray(maxRows) && maxRows.length ? maxRows[0].nextId : 1;
            await pool.query('INSERT INTO users (id, email, password_hash, role, balance, created_at, updated_at) VALUES (?, ?, ?, "admin", 0, NOW(), NOW())', [nextId, email, password_hash]);
            console.log(`[adminBootstrap] Admin created (explicit id=${nextId}): ${email} / ${mask(password)}`);
            return;
        }
        throw e;
    }
}
