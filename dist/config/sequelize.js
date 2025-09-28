import { Sequelize } from 'sequelize';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();
const DB_URL = process.env.DATABASE_URL || process.env.MYSQL_URL || process.env.DB_URL;
export const sequelize = DB_URL
    ? new Sequelize(DB_URL, {
        dialect: 'mysql',
        logging: false,
        define: { underscored: true, freezeTableName: true },
    })
    : new Sequelize(process.env.DB_NAME || 'the2win', process.env.DB_USER || 'root', process.env.DB_PASSWORD || '', {
        host: process.env.DB_HOST || 'localhost',
        port: Number(process.env.DB_PORT || 3306),
        dialect: 'mysql',
        logging: false,
        define: {
            underscored: true,
            freezeTableName: true,
        },
    });
export async function ensureDatabase() {
    // When using a URL, assume database exists (provisioned) and skip ensure step
    const DB_URL = process.env.DATABASE_URL || process.env.MYSQL_URL || process.env.DB_URL;
    if (DB_URL)
        return;
    const host = process.env.DB_HOST || 'localhost';
    const port = Number(process.env.DB_PORT || 3306);
    const user = process.env.DB_USER || 'root';
    const password = process.env.DB_PASSWORD || '';
    const database = process.env.DB_NAME || 'the2win';
    const conn = await mysql.createConnection({ host, port, user, password });
    try {
        await conn.query(`CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    }
    finally {
        await conn.end();
    }
}
export async function initSequelize() {
    await ensureDatabase();
    // Register models
    const { registerModels } = await import('../models/index.js');
    registerModels(sequelize);
    // Only sync when explicitly requested to avoid altering schemas unexpectedly
    const wantSync = process.env.DB_SYNC === 'true';
    const alter = process.env.DB_SYNC_ALTER === 'true';
    if (wantSync) {
        await sequelize.sync({ alter });
    }
}
