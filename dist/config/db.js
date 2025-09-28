import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
dotenv.config();
const DB_URL = process.env.DATABASE_URL || process.env.MYSQL_URL || process.env.DB_URL;
export const pool = DB_URL
    ? mysql.createPool(DB_URL)
    : mysql.createPool({
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT || 3306),
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME || 'the2win',
        connectionLimit: 10,
    });
export async function ping() {
    const conn = await pool.getConnection();
    try {
        await conn.ping();
    }
    finally {
        conn.release();
    }
}
