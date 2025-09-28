import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { AdminOverride, User, Transaction, DepositRequest, WithdrawRequest, CrashPattern } from '../models/index.js';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { Op } from 'sequelize';
import { pool } from '../config/db.js';
const router = Router();
router.use(requireAuth, requireAdmin);
// Queue overrides
router.post('/overrides/crash', async (req, res, next) => {
    try {
        const { crashPoint } = z.object({ crashPoint: z.number().positive() }).parse(req.body);
        const rec = await AdminOverride.create({ id: nanoid(), game: 'crash', payload: { crashPoint }, createdBy: String(req.user.id) });
        res.json(rec);
    }
    catch (e) {
        next(e);
    }
});
router.post('/overrides/wingo', async (req, res, next) => {
    try {
        const { color } = z.object({ color: z.enum(['GREEN', 'PURPLE', 'RED']) }).parse(req.body);
        const rec = await AdminOverride.create({ id: nanoid(), game: 'wingo', payload: { color }, createdBy: String(req.user.id) });
        res.json(rec);
    }
    catch (e) {
        next(e);
    }
});
router.get('/overrides', async (_req, res, next) => {
    try {
        const list = await AdminOverride.findAll({ order: [['createdAtMs', 'DESC']], limit: 50 });
        res.json(list);
    }
    catch (e) {
        next(e);
    }
});
router.delete('/overrides/:id', async (req, res, next) => {
    try {
        const id = req.params.id;
        const ov = await AdminOverride.findByPk(id);
        if (!ov)
            return res.status(404).json({ message: 'Not found' });
        await ov.destroy();
        res.json({ ok: true });
    }
    catch (e) {
        next(e);
    }
});
// Crash Patterns management
router.get('/crash-patterns', async (_req, res, next) => {
    try {
        const rows = await CrashPattern.findAll({ order: [['createdAt', 'ASC']] });
        res.json(rows);
    }
    catch (e) {
        next(e);
    }
});
router.post('/crash-patterns', async (req, res, next) => {
    try {
        const { name, sequence } = z.object({ name: z.string().min(2), sequence: z.array(z.number().gt(1)) }).parse(req.body);
        const rec = await CrashPattern.create({ id: crypto.randomUUID(), name, sequence, active: false });
        res.json(rec);
    }
    catch (e) {
        next(e);
    }
});
router.post('/crash-patterns/:id/activate', async (req, res, next) => {
    try {
        const id = req.params.id;
        await CrashPattern.update({ active: false }, { where: {} });
        const rec = await CrashPattern.findByPk(id);
        if (!rec)
            return res.status(404).json({ message: 'Not found' });
        rec.active = true;
        rec.currentIndex = 0;
        await rec.save();
        res.json({ ok: true });
    }
    catch (e) {
        next(e);
    }
});
router.put('/crash-patterns/:id', async (req, res, next) => {
    try {
        const id = req.params.id;
        const { name, sequence } = z.object({ name: z.string().min(2), sequence: z.array(z.number().gt(1)) }).parse(req.body);
        const rec = await CrashPattern.findByPk(id);
        if (!rec)
            return res.status(404).json({ message: 'Not found' });
        rec.name = name;
        rec.sequence = sequence;
        rec.currentIndex = 0;
        await rec.save();
        res.json(rec);
    }
    catch (e) {
        next(e);
    }
});
// Stats & users
router.get('/stats', async (_req, res, next) => {
    try {
        const since = Date.now() - 24 * 60 * 60 * 1000;
        const [userCount, txCount, depositSum, withdrawSum, activeUsers] = await Promise.all([
            User.count(),
            Transaction.count(),
            Transaction.sum('amount', { where: { type: 'DEPOSIT' } }),
            Transaction.sum('amount', { where: { type: 'WITHDRAW' } }),
            // Active users in last 24h based on transactions
            (async () => {
                const rows = await Transaction.findAll({ attributes: ['userId'], group: ['userId'], order: [], limit: 10000, where: { createdAt: { [Op.gte]: new Date(since) } } });
                return rows.length;
            })()
        ]);
        res.json({ userCount, txCount, depositSum: Number(depositSum || 0), withdrawSum: Number(withdrawSum || 0), activeUsers });
    }
    catch (e) {
        next(e);
    }
});
router.get('/users', async (_req, res, next) => {
    try {
        // Prefer raw SQL selecting only safe columns present across schemas
        const [rows] = await pool.query(`SELECT 
         id,
         email,
         COALESCE(role, 'user') AS role,
         COALESCE(balance, 0) AS balance,
         created_at AS createdAt
       FROM users
       ORDER BY created_at DESC
       LIMIT 200`);
        const list = rows.map(r => ({
            id: String(r.id),
            email: r.email,
            role: r.role || 'user',
            balance: Number(r.balance) || 0,
            createdAt: r.createdAt,
        }));
        return res.json(list);
    }
    catch (e) {
        // Fallback to ORM in case raw driver fails, but beware of schema drift
        try {
            const users = await User.findAll({ order: [['createdAt', 'DESC']], limit: 200 });
            return res.json(users.map((u) => ({ id: u.id, email: u.email, role: u.role || 'user', balance: Number(u.balance), createdAt: u.createdAt })));
        }
        catch (e2) {
            return next(e2);
        }
    }
});
router.get('/transactions', async (_req, res, next) => {
    try {
        // Probe INFORMATION_SCHEMA to discover available columns
        const [cols] = await pool.query(`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'transactions'`);
        const names = new Set(cols.map(c => String(c.COLUMN_NAME).toLowerCase()));
        const hasMeta = names.has('meta');
        const hasMetadata = names.has('metadata');
        const hasStatus = names.has('status');
        const selectMeta = hasMeta ? 'meta' : (hasMetadata ? 'metadata' : 'NULL');
        // If status exists, show only completed/approved (accepted) transactions
        const whereStatus = hasStatus ? `WHERE status IN ('completed','approved')` : '';
        const [rows] = await pool.query(`SELECT id, user_id AS userId, UPPER(type) AS type, amount, created_at AS createdAt, ${selectMeta} AS meta
       FROM transactions
       ${whereStatus}
       ORDER BY created_at DESC
       LIMIT 300`);
        const list = rows.map(r => ({
            id: String(r.id ?? ''),
            userId: String(r.userId ?? ''),
            type: String(r.type ?? ''),
            amount: Number(r.amount ?? 0),
            createdAt: r.createdAt,
            meta: (() => { try {
                return typeof r.meta === 'string' ? JSON.parse(r.meta) : r.meta;
            }
            catch {
                return r.meta;
            } })()
        }));
        return res.json(list);
    }
    catch (e) {
        // Last resort: ORM
        try {
            const txs = await Transaction.findAll({ order: [['createdAt', 'DESC']], limit: 300 });
            return res.json(txs);
        }
        catch (e2) {
            return next(e2);
        }
    }
});
// Transactions summary for admin (expenses/income)
router.get('/transactions/summary', async (_req, res, next) => {
    try {
        // Normalize type to uppercase for grouping across schemas
        const [rows] = await pool.query(`SELECT UPPER(type) AS type, SUM(amount) AS total
       FROM transactions
       GROUP BY UPPER(type)`);
        const map = {};
        for (const r of rows)
            map[String(r.type)] = Number(r.total) || 0;
        // Common mappings: DEPOSIT (income), WITHDRAW (expense), BET (exposure), WIN (payout expense)
        res.json({
            DEPOSIT: map.DEPOSIT || 0,
            WITHDRAW: map.WITHDRAW || 0,
            BET: map.BET || 0,
            WIN: map.WIN || 0,
        });
    }
    catch (e) {
        next(e);
    }
});
// Delete user account (admin only). Prevent deleting self.
router.delete('/users/:id', async (req, res, next) => {
    try {
        const { id } = req.params;
        if (!id)
            return res.status(400).json({ message: 'Missing id' });
        if (String(req.user.id) === String(id))
            return res.status(400).json({ message: 'Cannot delete your own admin account' });
        // Try ORM first
        try {
            const u = await User.findByPk(id);
            if (u) {
                await u.destroy();
                return res.json({ ok: true });
            }
        }
        catch { }
        // Fallback raw SQL; rely on ON DELETE CASCADE in FKs when present
        const [result] = await pool.query(`DELETE FROM users WHERE id=?`, [id]);
        const affected = Number(result?.affectedRows || 0);
        if (!affected)
            return res.status(404).json({ message: 'User not found' });
        return res.json({ ok: true });
    }
    catch (e) {
        next(e);
    }
});
// Deposit requests moderation
router.get('/deposit-requests', async (_req, res, next) => {
    try {
        const rows = await DepositRequest.findAll({ order: [['createdAtMs', 'DESC']], limit: 200 });
        res.json(rows);
    }
    catch (e) {
        next(e);
    }
});
router.post('/deposit-requests/:id/approve', async (req, res, next) => {
    try {
        const rec = await DepositRequest.findByPk(req.params.id);
        if (!rec)
            return res.status(404).json({ message: 'Not found' });
        if (rec.status !== 'PENDING')
            return res.status(400).json({ message: 'Already reviewed' });
        rec.status = 'APPROVED';
        rec.reviewedAtMs = Date.now();
        rec.reviewedBy = String(req.user.id);
        await rec.save();
        // Credit user balance via transaction
        const amt = Number(rec.amount);
        // If USDT (binance), convert to coins at 1 USDT = 100 coins
        const credit = rec.method === 'binance' ? (amt * 100) : amt;
        await (await import('../services/walletService.js')).addTransaction(rec.userId, 'DEPOSIT', credit, { method: rec.method, depositRequestId: rec.id, rate: rec.method === 'binance' ? '1USDT=100coins' : undefined });
        res.json({ ok: true });
    }
    catch (e) {
        next(e);
    }
});
router.post('/deposit-requests/:id/reject', async (req, res, next) => {
    try {
        const rec = await DepositRequest.findByPk(req.params.id);
        if (!rec)
            return res.status(404).json({ message: 'Not found' });
        if (rec.status !== 'PENDING')
            return res.status(400).json({ message: 'Already reviewed' });
        rec.status = 'REJECTED';
        rec.reviewedAtMs = Date.now();
        rec.reviewedBy = String(req.user.id);
        await rec.save();
        res.json({ ok: true });
    }
    catch (e) {
        next(e);
    }
});
// Withdraw requests moderation
router.get('/withdraw-requests', async (_req, res, next) => {
    try {
        const rows = await WithdrawRequest.findAll({ order: [['createdAtMs', 'DESC']], limit: 200 });
        res.json(rows);
    }
    catch (e) {
        next(e);
    }
});
router.post('/withdraw-requests/:id/approve', async (req, res, next) => {
    try {
        const rec = await WithdrawRequest.findByPk(req.params.id);
        if (!rec)
            return res.status(404).json({ message: 'Not found' });
        if (rec.status !== 'PENDING')
            return res.status(400).json({ message: 'Already reviewed' });
        rec.status = 'APPROVED';
        rec.reviewedAtMs = Date.now();
        rec.reviewedBy = String(req.user.id);
        await rec.save();
        // Debit user balance via transaction
        await (await import('../services/walletService.js')).addTransaction(rec.userId, 'WITHDRAW', Number(rec.amount), { method: rec.method, withdrawRequestId: rec.id });
        res.json({ ok: true });
    }
    catch (e) {
        next(e);
    }
});
router.post('/withdraw-requests/:id/reject', async (req, res, next) => {
    try {
        const rec = await WithdrawRequest.findByPk(req.params.id);
        if (!rec)
            return res.status(404).json({ message: 'Not found' });
        if (rec.status !== 'PENDING')
            return res.status(400).json({ message: 'Already reviewed' });
        rec.status = 'REJECTED';
        rec.reviewedAtMs = Date.now();
        rec.reviewedBy = String(req.user.id);
        await rec.save();
        res.json({ ok: true });
    }
    catch (e) {
        next(e);
    }
});
export default router;
