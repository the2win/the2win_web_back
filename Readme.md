# the2win Backend
## ORM and Database

This service uses Sequelize (MySQL) models for Users, Transactions, Crash/Wingo rounds and bets. On startup, the server will:

- Ensure the target database exists (CREATE DATABASE IF NOT EXISTS)
- Register models and auto-sync the schema

Control with env vars:

- `DB_SYNC=true` to force sync in any environment (defaults true in non-production)
- `DB_SYNC_ALTER=true` to allow ALTER-based schema updates (defaults true in non-production)

Environment DB vars:

- `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`


Initial backend scaffold with MySQL schema and migration system.

## Quick Start

1. Copy environment file
```
copy backend/.env.example backend/.env
```
2. Edit `backend/.env` with your database credentials.
3. Install dependencies
```
cd backend
npm install
```
4. Run migrations (SQL files in `src/migrations` are applied automatically)
```
npm run migrate
```
5. Admin auto-creation

On startup the server will ensure an admin account exists using these env vars (with safe defaults for local dev):

- `ADMIN_EMAIL` (default: admin@the2win.local)
- `ADMIN_PASSWORD` (default: ChangeThisAdminPass123!)
- `ADMIN_FORCE_RESET` (optional, default: false) — if true, updates existing admin's password and role

You can still run the legacy seeder:
```
npm run seed:admin
```
6. Start dev server
```
npm run dev
```

Health check: GET http://localhost:4000/health

## Tables Overview (managed via SQL migrations)
- users: accounts with role & balance.
- agents: cash deposit agents linked to a user.
- bank_accounts: user withdrawal accounts.
- transactions: all monetary movements & statuses.
- receipts: uploaded deposit proof metadata.
- agent_deposits: cash agent facilitated deposits.
- crash_rounds / crash_bets: Crash game history & bets.
- wingo_rounds / wingo_bets: Wingo game rounds & bets.
- boxes_plays: Boxes game plays.
- game_overrides: Admin scheduled next outcomes.

## Next Steps
- Implement auth (register/login, jwt cookie) & /auth/me. [DONE]
- Add wallet endpoints (list transactions, create deposit/withdraw request). [DONE]
- Implement game engines & SSE streams. [IN PROGRESS]
- Enforce overrides and fairness hashing logic. [IN PROGRESS]
- File upload handler for receipts (link to receipts + transactions). [DONE]
