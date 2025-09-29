import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { pool } from '../config/db.js';
async function main() {
    const email = process.env.SET_PASSWORD_EMAIL;
    const password = process.env.SET_PASSWORD_VALUE;
    if (!email || !password) {
        console.error('Usage: SET_PASSWORD_EMAIL=<email> SET_PASSWORD_VALUE=<new_password> npm run ts-node src/scripts/setPassword.ts');
        process.exit(1);
    }
    const [rows] = await pool.query(`SELECT id FROM users WHERE email=? LIMIT 1`, [email]);
    if (!Array.isArray(rows) || !rows.length) {
        console.error('No user found with that email');
        process.exit(2);
    }
    const id = rows[0].id;
    const hash = await bcrypt.hash(password, 10);
    await pool.query(`UPDATE users SET password_hash=?, updated_at=NOW() WHERE id=?`, [hash, id]);
    console.log(`Password updated for ${email} (id=${id})`);
}
main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
