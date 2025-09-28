// In-memory fallback logic handled within catch blocks below; primary path is DB.
import { db } from '../models/memoryDB.js';
import { nanoid } from 'nanoid';
import { pool } from '../config/db.js';
import { sequelize, } from '../config/sequelize.js';
import type { Transaction as SequelizeTx } from 'sequelize';
import { User, Transaction } from '../models/index.js';

export async function getBalance(userId: string) {
  try {
    const u = await User.findByPk(userId);
    if (u) return Number(u.balance);
  } catch {}
  try {
    const [rows] = await pool.query<any[]>(`SELECT balance FROM users WHERE id=?`, [userId]);
    if (Array.isArray(rows) && rows.length) return rows[0].balance;
  } catch {}
  const user = db.users.find(u => u.id === userId);
  if (!user) throw new Error('User not found');
  return user.balance;
}

export async function addTransaction(userId: string, type: 'DEPOSIT' | 'WITHDRAW' | 'BET' | 'WIN', amount: number, meta?: any) {
  const createdAtMs = Date.now();
  const id = nanoid();
  const metaJson = meta ? JSON.stringify(meta) : null;

  // 1) Try via Sequelize (works when ORM models match DB schema)
  try {
    return await sequelize.transaction(async (t: SequelizeTx) => {
      const u = await User.findByPk(userId, { transaction: t, lock: t.LOCK.UPDATE });
      if (!u) throw new Error('User not found');
      let balance = Number(u.balance);
      if (type === 'WITHDRAW' || type === 'BET') {
        if (balance < amount) throw new Error('Insufficient balance');
        balance -= amount;
      } else if (type === 'DEPOSIT' || type === 'WIN') {
        balance += amount;
      }
      u.balance = balance as any;
      await u.save({ transaction: t });
      await Transaction.create({ id, userId, type: type as any, amount: amount as any, meta: metaJson ? JSON.parse(metaJson) : null }, { transaction: t });
      return { id, userId, type, amount, createdAt: createdAtMs, meta, balance } as any;
    });
  } catch {}

  // 2) Fallback: Raw SQL, with compatibility for both schema variants
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [userRows] = await conn.query<any[]>(`SELECT balance FROM users WHERE id=? FOR UPDATE`, [userId]);
    if (!Array.isArray(userRows) || !userRows.length) throw new Error('User not found');
    let balance = Number(userRows[0].balance);
    if (type === 'WITHDRAW' || type === 'BET') {
      if (balance < amount) throw new Error('Insufficient balance');
      balance -= amount;
    } else if (type === 'DEPOSIT' || type === 'WIN') {
      balance += amount;
    }
    await conn.query(`UPDATE users SET balance=? WHERE id=?`, [balance, userId]);

    // Try variant A: columns (id,user_id,type,amount,meta) and let created_at default
    try {
      if (metaJson) {
        await conn.query(`INSERT INTO transactions (id,user_id,type,amount,meta) VALUES (?,?,?,?,?)`, [id, userId, type, amount, metaJson]);
      } else {
        await conn.query(`INSERT INTO transactions (id,user_id,type,amount) VALUES (?,?,?,?)`, [id, userId, type, amount]);
      }
    } catch (e: any) {
      // Variant B: legacy schema with lowercase enums, 'metadata' column, optional method/status
      const typeMap: Record<string, string> = { DEPOSIT: 'deposit', WITHDRAW: 'withdraw', BET: 'bet', WIN: 'payout' };
      const legacyType = typeMap[type] || type.toLowerCase();
      const metaColValue = metaJson ?? null;
      try {
        await conn.query(
          `INSERT INTO transactions (user_id,type,amount,metadata,status,method) VALUES (?,?,?,?,?,?)`,
          [userId, legacyType, amount, metaColValue, 'completed', 'game']
        );
      } catch (e2: any) {
        // Variant C: legacy schema requiring created_at BIGINT
        await conn.query(
          `INSERT INTO transactions (user_id,type,amount,metadata,status,method,created_at) VALUES (?,?,?,?,?,?,?)`,
          [userId, legacyType, amount, metaColValue, 'completed', 'game', createdAtMs]
        );
      }
    }

    await conn.commit();
    return { id, userId, type, amount, createdAt: createdAtMs, meta, balance } as any;
  } catch (e) {
    try { await conn.rollback(); } catch {}
    // 3) Final fallback: in-memory (dev only)
    const user = db.users.find(u => u.id === userId);
    if (!user) throw e; // Preserve original DB error (likely 'User not found')
    if (type === 'WITHDRAW' || type === 'BET') {
      if (user.balance < amount) throw new Error('Insufficient balance');
      user.balance -= amount;
    } else if (type === 'DEPOSIT' || type === 'WIN') {
      user.balance += amount;
    }
    const tx = { id, userId, type, amount, createdAt: createdAtMs, meta } as any;
    db.transactions.push(tx);
    return { ...tx, balance: user.balance };
  } finally {
    conn.release();
  }
}

export async function listTransactions(userId: string) {
  try {
  const [rows] = await pool.query<any[]>(`SELECT id,type,amount,created_at as createdAt,meta FROM transactions WHERE user_id=? ORDER BY created_at DESC LIMIT 200`, [userId]);
  return (rows as any[]).map((r: any) => ({ id: r.id, userId, type: r.type, amount: r.amount, createdAt: r.createdAt, meta: r.meta ? JSON.parse(r.meta) : undefined }));
  } catch {
    return db.transactions.filter(t => t.userId === userId).sort((a,b)=> b.createdAt - a.createdAt);
  }
}
