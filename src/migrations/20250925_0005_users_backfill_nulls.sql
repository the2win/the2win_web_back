-- Backfill existing NULLs in users table for role and balance
-- Set any NULL balance to 0
UPDATE users SET balance = 0 WHERE balance IS NULL;

-- Set any NULL or empty role to 'user'
UPDATE users SET role = 'user' WHERE role IS NULL OR role = '';

-- If an admin email is known via environment, try to promote that record to admin.
-- Since migrations run in MySQL without access to env, we fall back to a common default.
-- Promote default admin email if exists.
UPDATE users SET role = 'admin' WHERE email = 'admin@the2win.local';
