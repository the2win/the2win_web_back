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
    console.log('[fixLegacyPasswords] No legacy `password` column found. Will still normalize any legacy bcrypt variants.');
  }

  // 1) Migrate plaintext passwords to bcrypt where password_hash is empty
  const [rows] = await pool.query<any[]>(
    `SELECT id, email, password AS legacyPass, password_hash AS passwordHash
     FROM users 
     WHERE (password_hash IS NULL OR password_hash = '') AND password IS NOT NULL AND password != ''`
  );
  if (Array.isArray(rows) && rows.length) {
    console.log(`[fixLegacyPasswords] Migrating ${rows.length} plaintext password(s) to bcrypt...`);
    let migrated = 0;
    for (const r of rows) {
      const legacy = String(r.legacyPass || '');
      if (!legacy) continue;
      const hash = await bcrypt.hash(legacy, 10);
      await pool.query(`UPDATE users SET password_hash=?, updated_at=NOW() WHERE id=?`, [hash, r.id]);
      migrated++;
    }
    console.log(`[fixLegacyPasswords] Completed. Migrated: ${migrated}`);
  } else {
    console.log('[fixLegacyPasswords] No plaintext rows need migration.');
  }

  // 2) Normalize legacy bcrypt prefixes ($2y$, $2x$) and trim whitespace
  const [hashRows] = await pool.query<any[]>(
    `SELECT id, password_hash AS passwordHash FROM users WHERE password_hash IS NOT NULL AND password_hash != ''`
  );
  let normalizedCount = 0;
  for (const r of (Array.isArray(hashRows) ? hashRows : [])) {
    const raw = String(r.passwordHash || '');
    const trimmed = raw.trim();
    const needsTrim = trimmed !== raw;
    const needsPrefix = trimmed.startsWith('$2y$') || trimmed.startsWith('$2x$');
    if (needsTrim || needsPrefix) {
      const next = needsPrefix ? ('$2a$' + trimmed.slice(4)) : trimmed;
      await pool.query(`UPDATE users SET password_hash=?, updated_at=NOW() WHERE id=?`, [next, r.id]);
      normalizedCount++;
    }
  }
  if (normalizedCount) {
    console.log(`[fixLegacyPasswords] Normalized ${normalizedCount} legacy bcrypt hash(es).`);
  } else {
    console.log('[fixLegacyPasswords] No legacy bcrypt hashes needed normalization.');
  }
}
// Allow running as a standalone script
if (process.argv[1] && process.argv[1].includes('fixLegacyPasswords')) {
  runFixLegacyPasswords().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
}
