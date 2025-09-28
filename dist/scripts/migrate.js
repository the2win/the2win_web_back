import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();
function getConnConfig() {
    const DB_URL = process.env.DATABASE_URL || process.env.MYSQL_URL || process.env.DB_URL;
    if (DB_URL) {
        return DB_URL; // mysql2 accepts a connection URI string
    }
    return {
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT || 3306),
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        multipleStatements: true,
    };
}
async function ensureMigrationsTable(conn) {
    await conn.query(`CREATE TABLE IF NOT EXISTS migrations (id INT AUTO_INCREMENT PRIMARY KEY, filename VARCHAR(255) NOT NULL UNIQUE, executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
}
async function applied(conn) {
    const [rows] = await conn.query(`SELECT filename FROM migrations`);
    return new Set(rows.map((r) => r.filename));
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
        if (fs.existsSync(alt))
            dir = alt;
    }
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
    // Simple SQL splitter that respects quotes/backticks (no procedure support)
    function splitSql(sql) {
        const stmts = [];
        let cur = '';
        let inSingle = false;
        let inDouble = false;
        let inBacktick = false;
        for (let i = 0; i < sql.length; i++) {
            const ch = sql[i];
            const prev = sql[i - 1];
            if (!inDouble && !inBacktick && ch === "'" && prev !== '\\')
                inSingle = !inSingle;
            else if (!inSingle && !inBacktick && ch === '"' && prev !== '\\')
                inDouble = !inDouble;
            else if (!inSingle && !inDouble && ch === '`')
                inBacktick = !inBacktick;
            if (!inSingle && !inDouble && !inBacktick && ch === ';') {
                if (cur.trim())
                    stmts.push(cur.trim());
                cur = '';
            }
            else {
                cur += ch;
            }
        }
        if (cur.trim())
            stmts.push(cur.trim());
        // Remove line comments starting with -- and empty lines
        return stmts
            .map(s => s.replace(/\n\s*--.*$/gm, '').trim())
            .filter(s => s.length > 0);
    }
    for (const f of files) {
        if (done.has(f))
            continue;
        const sql = fs.readFileSync(path.join(dir, f), 'utf8');
        process.stdout.write(`Applying migration: ${f} ... `);
        try {
            await conn.beginTransaction();
            const statements = splitSql(sql);
            for (const stmt of statements) {
                await conn.query(stmt);
            }
            await conn.query('INSERT INTO migrations (filename) VALUES (?)', [f]);
            await conn.commit();
            console.log('done');
        }
        catch (e) {
            await conn.rollback();
            console.error(`failed: ${e.message}`);
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
