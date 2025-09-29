import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { pool } from '../config/db.js';

export async function runFixLegacyPasswords() {
  console.log('[fixLegacyPasswords] scanning users table...');
  // Try to detect a legacy plaintext `password` column; if present, migrate rows where password_hash is NULL/empty
  const [colCheck] = await pool.query<any[]>(
    `SELECT COUNT(*) AS hasLegacy FROM INFORMATION_SCHEMA.COLUMNS 
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'password'`
  );
  const hasLegacy = Array.isArray(colCheck) && colCheck.length && Number((colCheck as any)[0].hasLegacy) > 0;
  if (!hasLegacy) {
    console.log('[fixLegacyPasswords] No legacy `password` column found. Nothing to do.');
    return;
  }

  const [rows] = await pool.query<any[]>(
    `SELECT id, email, password AS legacyPass, password_hash AS passwordHash
     FROM users 
     WHERE (password_hash IS NULL OR password_hash = '') AND password IS NOT NULL AND password != ''`
  );
  if (!Array.isArray(rows) || rows.length === 0) {
    console.log('[fixLegacyPasswords] No rows need migration.');
    return;
  }
  console.log(`[fixLegacyPasswords] Migrating ${rows.length} user(s)...`);
  let migrated = 0;
  for (const r of rows) {
    const legacy = String(r.legacyPass || '');
    if (!legacy) continue;
    const hash = await bcrypt.hash(legacy, 10);
    await pool.query(`UPDATE users SET password_hash=?, updated_at=NOW() WHERE id=?`, [hash, r.id]);
    migrated++;
  }
  console.log(`[fixLegacyPasswords] Completed. Migrated: ${migrated}`);
}
// Allow running as a standalone script
if (process.argv[1] && process.argv[1].includes('fixLegacyPasswords')) {
  runFixLegacyPasswords().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
}
