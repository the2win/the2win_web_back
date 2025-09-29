import 'dotenv/config';
process.env.AUTH_DEBUG = process.env.AUTH_DEBUG || 'true';

const { login } = await import('../dist/services/authService.js');

const email = process.argv[2] || 'admin@the2win.local';
const password = process.argv[3] || 'ChangeThisAdminPass123!';

try {
  const result = await login(email, password);
  console.log('LOGIN_OK', JSON.stringify(result));
} catch (e) {
  console.error('LOGIN_FAIL', e?.message || e);
  if (e?.debug) console.error('DEBUG', JSON.stringify(e.debug));
  process.exitCode = 1;
}
