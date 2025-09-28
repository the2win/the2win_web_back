import { Router } from 'express';
import { pool } from '../config/db.js';
import { requireAuth } from '../middleware/auth.js';
const router = Router();
router.get('/transactions', requireAuth, async (req, res) => {
    const [rows] = await pool.query('SELECT id,type,method,amount,status,reference,created_at FROM transactions WHERE user_id=? ORDER BY created_at DESC LIMIT 100', [req.user.id]);
    res.json(rows);
});
router.post('/deposit', requireAuth, async (req, res) => {
    const { amount, method } = req.body || {};
    if (!amount || amount <= 0)
        return res.status(400).json({ error: 'invalid_amount' });
    if (!['cash_agent', 'binance'].includes(method))
        return res.status(400).json({ error: 'invalid_method' });
    const [result] = await pool.query('INSERT INTO transactions (user_id,type,method,amount,status) VALUES (?,?,?,?,?)', [req.user.id, 'deposit', method, amount, 'pending']);
    const id = result.insertId;
    res.json({ id, amount, method, status: 'pending' });
});
router.post('/withdraw', requireAuth, async (req, res) => {
    const { amount, method } = req.body || {};
    if (!amount || amount <= 0)
        return res.status(400).json({ error: 'invalid_amount' });
    if (!['binance', 'bank'].includes(method))
        return res.status(400).json({ error: 'invalid_method' });
    // Simple balance check
    const [urows] = await pool.query('SELECT balance FROM users WHERE id=?', [req.user.id]);
    const user = urows[0];
    if (!user || Number(user.balance) < amount)
        return res.status(400).json({ error: 'insufficient_balance' });
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        await conn.query('UPDATE users SET balance = balance - ? WHERE id=?', [amount, req.user.id]);
        const [result] = await conn.query('INSERT INTO transactions (user_id,type,method,amount,status) VALUES (?,?,?,?,?)', [req.user.id, 'withdraw', method, amount, 'pending']);
        await conn.commit();
        const id = result.insertId;
        res.json({ id, amount, method, status: 'pending' });
    }
    catch (e) {
        await conn.rollback();
        res.status(500).json({ error: 'withdraw_failed' });
    }
    finally {
        conn.release();
    }
});
export default router;
