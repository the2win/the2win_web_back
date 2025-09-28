# MySQL Setup for The2Win Backend

1. Create database:
```sql
CREATE DATABASE the2win CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

2. Run schema:
```bash
mysql -u root -p the2win < schema.sql
```

3. Environment variables (add to `.env`):
```
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=the2win
```

4. Install dependencies (already added `mysql2`):
```bash
npm install
```

5. Start backend:
```bash
npm run dev
```

If MySQL is unreachable, the app falls back to in-memory storage (not persistent). Ensure tables exist for persistence.

Crash game: currently keeps live state in memory; only user balances & transactions are persisted. Extend by inserting rows into `crash_rounds` on round start/crash.

Security notes:
- Use a stronger `JWT_SECRET` in production.
- Consider limiting transaction size and adding anti-spam rate limits.
