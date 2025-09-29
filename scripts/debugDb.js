import 'dotenv/config';
const { pool } = await import('../dist/config/db.js');
try {
  const [rows] = await pool.query("SELECT id,email,role FROM users WHERE email=? LIMIT 1", ['admin@the2win.local']);
  console.log('rows', rows);
} catch (e) {
  console.error('DB_ERR', e?.message || e);
}
