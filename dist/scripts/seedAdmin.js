import dotenv from 'dotenv';
import { ensureAdminAccount } from '../utils/adminBootstrap.js';
dotenv.config();
async function run() {
    const email = process.env.ADMIN_EMAIL || 'admin@the2win.local';
    const password = process.env.ADMIN_PASSWORD || 'ChangeThisAdminPass123!';
    const forceReset = (process.env.ADMIN_FORCE_RESET || 'false').toLowerCase() === 'true';
    await ensureAdminAccount({ email, password, forceReset });
}
run();
