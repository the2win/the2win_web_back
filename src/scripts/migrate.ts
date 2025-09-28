import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

function getConnConfig() {
  return {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    multipleStatements: true,
  } as const;
}

async function ensureMigrationsTable(conn: mysql.Connection) {
  await conn.query(`CREATE TABLE IF NOT EXISTS migrations (id INT AUTO_INCREMENT PRIMARY KEY, filename VARCHAR(255) NOT NULL UNIQUE, executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
}

async function applied(conn: mysql.Connection): Promise<Set<string>> {
  const [rows] = await conn.query(`SELECT filename FROM migrations`);
  return new Set((rows as any[]).map((r: any) => r.filename));
}

export async function migrate() {
  const conn = await mysql.createConnection(getConnConfig());
  await ensureMigrationsTable(conn);
  const done = await applied(conn);
  // Resolve to backend/src/migrations from project root; fallback to relative from this file
  const rootDir = process.cwd();
  let dir = path.resolve(rootDir, 'src', 'migrations');
  if (!fs.existsSync(dir)) {
    const __filename = fileURLToPath(import.meta.url);
    const __dirnameEq = path.dirname(__filename);
    const alt = path.resolve(__dirnameEq, '..', '..', 'src', 'migrations');
    if (fs.existsSync(alt)) dir = alt;
  }
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
  for (const f of files) {
    if (done.has(f)) continue;
    const sql = fs.readFileSync(path.join(dir, f), 'utf8');
    process.stdout.write(`Applying migration: ${f} ... `);
    try {
      await conn.beginTransaction();
      await conn.query(sql);
      await conn.query('INSERT INTO migrations (filename) VALUES (?)', [f]);
      await conn.commit();
      console.log('done');
    } catch (e) {
      await conn.rollback();
      console.error(`failed: ${(e as Error).message}`);
      process.exitCode = 1;
      break;
    }
  }
  await conn.end();
}

// Run only when invoked directly (CLI)
const invokedDirectly = process.argv[1] && /migrate\.(ts|js)$/.test(process.argv[1]);
if (invokedDirectly) {
  migrate();
}
