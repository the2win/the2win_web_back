import { Router } from 'express';
import { requireAuth, AuthedRequest } from '../middleware/auth.js';
import { getBalance, addTransaction, listTransactions } from '../services/walletService.js';
import { nanoid } from 'nanoid';
import { DepositRequest, WithdrawRequest, BankAccount } from '../models/index.js';
import { z } from 'zod';
import { Op } from 'sequelize';
import fs from 'fs';
import path from 'path';

const router = Router();

// Supported Indian banks (for display/validation)
const INDIAN_BANKS = [
  'State Bank of India (SBI)', 'HDFC Bank', 'ICICI Bank', 'Axis Bank', 'Kotak Mahindra Bank', 'Bank of Baroda',
  'Punjab National Bank (PNB)', 'Canara Bank', 'Union Bank of India', 'IDBI Bank', 'Yes Bank', 'IndusInd Bank',
  'Indian Bank', 'Central Bank of India', 'UCO Bank', 'Bank of India', 'Punjab & Sind Bank', 'RBL Bank',
  'Federal Bank', 'IDFC FIRST Bank', 'AU Small Finance Bank'
];

router.get('/banks/in', (_req, res) => res.json({ banks: INDIAN_BANKS }));

// Manage user's bank accounts
router.get('/bank-accounts', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const accounts = await BankAccount.findAll({ where: { userId: String(req.user!.id) }, order: [['isDefault','DESC'], ['id','DESC']] });
    res.json({ accounts: accounts.map(a => ({ id: String(a.id), bankName: a.bankName, accountNumber: a.accountNumber, accountHolder: a.accountHolder, isDefault: !!a.isDefault })) });
  } catch (e) { next(e); }
});

router.post('/bank-accounts', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const { bankName, accountNumber, accountHolder, makeDefault } = z.object({
      bankName: z.string().min(2),
      accountNumber: z.string().min(6).max(34),
      accountHolder: z.string().min(2).max(120),
      makeDefault: z.boolean().optional()
    }).parse(req.body);
    if (!INDIAN_BANKS.includes(bankName)) return res.status(400).json({ message: 'Unsupported bank' });
    const acct = await BankAccount.create({ userId: String(req.user!.id), bankName, accountNumber, accountHolder, isDefault: makeDefault ? 1 : 0 } as any);
    if (makeDefault) {
      await BankAccount.update({ isDefault: 0 } as any, { where: { userId: String(req.user!.id), id: { [Op.ne]: acct.id } } });
    }
    res.json({ account: { id: String(acct.id), bankName, accountNumber, accountHolder, isDefault: !!acct.isDefault } });
  } catch (e) { next(e); }
});

router.post('/bank-accounts/:id/default', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const id = req.params.id; const userId = String(req.user!.id);
    const acct = await BankAccount.findOne({ where: { id, userId } });
    if (!acct) return res.status(404).json({ message: 'Not found' });
    await BankAccount.update({ isDefault: 0 } as any, { where: { userId } });
    acct.isDefault = 1 as any; await acct.save();
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.get('/balance', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
  const balance = await getBalance(String(req.user!.id));
    res.json({ balance });
  } catch (e) { next(e); }
});

router.get('/transactions', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
  const transactions = await listTransactions(String(req.user!.id));
    res.json({ transactions });
  } catch (e) { next(e); }
});

// User-facing request status lists
router.get('/deposit-requests', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const rows = await DepositRequest.findAll({ where: { userId: String(req.user!.id) }, order: [['createdAtMs','DESC']], limit: 100 });
    res.json({ requests: rows });
  } catch (e) { next(e); }
});
router.get('/withdraw-requests', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const rows = await WithdrawRequest.findAll({ where: { userId: String(req.user!.id) }, order: [['createdAtMs','DESC']], limit: 100 });
    res.json({ requests: rows });
  } catch (e) { next(e); }
});

router.post('/deposit', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const { amount, method, receiptBase64 } = z.object({
      amount: z.number().positive('Amount must be greater than zero'),
      method: z.enum(['binance','cash_agent']),
      // Accept a base64 data URL or raw base64 string for the image
      receiptBase64: z.string().optional()
    }).parse(req.body);

    // Enforce deposit limits in LKR
    if (amount < 1000 || amount > 500000) return res.status(400).json({ message: 'Amount must be between Rs. 1000 and Rs. 500000' });

    // Optional: Store uploaded receipt image
    let receiptPath: string | null = null;
    if (receiptBase64 && receiptBase64.length < 15 * 1024 * 1024) { // 15MB safe guard
      try {
        const uploadsDir = path.resolve(process.cwd(), 'uploads');
        if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
        const id = nanoid();
        // Handle optional data URL prefix
        const m = receiptBase64.match(/^data:(.+?);base64,(.+)$/);
        const base64Payload = m ? m[2] : receiptBase64;
        const buffer = Buffer.from(base64Payload, 'base64');
        // naive mime detection
        const ext = (m?.[1] || '').includes('png') ? 'png' : (m?.[1] || '').includes('jpeg') ? 'jpg' : 'png';
        const filename = `receipt_${id}.${ext}`;
        const filePath = path.join(uploadsDir, filename);
        fs.writeFileSync(filePath, buffer);
        receiptPath = `/uploads/${filename}`; // public URL path
      } catch {}
    }

    // For moderation flow: create a deposit request in PENDING; admin will approve to credit balance
    const rec = await DepositRequest.create({ id: nanoid(), userId: String(req.user!.id), amount: amount as any, method: method as any, receiptPath });
    res.json({ request: rec });
  } catch (e) { next(e); }
});

router.post('/withdraw', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const { amount, method, dest, bankAccountId } = z.object({
      amount: z.number().positive('Amount must be greater than zero'),
      method: z.enum(['bank_in','binance','cash_agent']),
      bankAccountId: z.string().optional(),
      dest: z.string().max(255).optional()
    }).parse(req.body);
    // Global withdraw limits in LKR
    if (amount < 1000 || amount > 200000) return res.status(400).json({ message: 'Withdraw amount must be between Rs. 1000 and Rs. 200000' });

    // Per-day cap: total approved+pending withdrawals today + this request must not exceed 200000
    const startOfDay = new Date(); startOfDay.setHours(0,0,0,0);
    const since = startOfDay.getTime();
    const todays = await WithdrawRequest.findAll({ where: { userId: String(req.user!.id), createdAtMs: { [Op.gte]: since } } as any });
    const todaysTotal = todays.reduce((sum, r:any) => sum + Number(r.amount || 0), 0);
    if ((todaysTotal + amount) > 200000) {
      return res.status(400).json({ message: 'Daily withdraw limit Rs. 200000 exceeded' });
    }

    // Validate bank account for bank_in
    if (method === 'bank_in') {
      if (!bankAccountId) return res.status(400).json({ message: 'bankAccountId required' });
      const acct = await BankAccount.findOne({ where: { id: bankAccountId, userId: String(req.user!.id) } });
      if (!acct) return res.status(400).json({ message: 'Invalid bank account' });
      // override dest to reference the bank account and include display info for admins
      // format: bank:<id>:<bankName>:<last4>
      const last4 = String(acct.accountNumber).slice(-4);
      req.body.dest = `bank:${acct.id}:${acct.bankName}:${last4}`;
    }

    // For binance, require destination address string (if enabled)
    if (method === 'binance') {
      if (!dest || dest.length < 6) return res.status(400).json({ message: 'Destination address required' });
    }

    // Create withdraw request pending admin approval; as requested, reduce balance immediately and include 1500 coin increase (fee)
    let finalDest: string | null = null;
    if (method === 'bank_in') {
      finalDest = req.body.dest as string; // constructed above
    } else if (method === 'binance') {
      finalDest = dest!;
    } else if (method === 'cash_agent') {
      // Optional note provided by user; otherwise mark as cash_agent
      finalDest = dest ? `cash_agent:${dest}` : 'cash_agent';
    }
    const totalDebit = amount; // no extra fee; amounts are in LKR
    // Immediately reduce user's balance by totalDebit; record meta so we can reconcile later
    try {
      const requestId = nanoid();
      const tx = await addTransaction(String(req.user!.id), 'WITHDRAW', totalDebit, { method, withdrawRequestId: requestId });
      const rec = await WithdrawRequest.create({ id: requestId, userId: String(req.user!.id), amount: amount as any, method: method as any, dest: finalDest });
      return res.json({ request: rec, balance: tx.balance });
    } catch (e:any) {
      return res.status(400).json({ message: e.message || 'Insufficient balance' });
    }
  } catch (e) { next(e); }
});

// User wallet summary (totals per type) for quick display in games section
router.get('/summary', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    // Prefer raw SQL for performance
    try {
      const [rows]: any = await (await import('../config/db.js')).pool.query(
        `SELECT UPPER(type) AS type, SUM(amount) AS total
         FROM transactions
         WHERE user_id = ?
         GROUP BY UPPER(type)`, [String(req.user!.id)]
      );
      const map: Record<string, number> = {};
      for (const r of rows as any[]) map[String(r.type)] = Number(r.total) || 0;
      return res.json({
        DEPOSIT: map.DEPOSIT || 0,
        WITHDRAW: map.WITHDRAW || 0,
        BET: map.BET || 0,
        WIN: map.WIN || 0,
      });
    } catch {}
    // Fallback ORM
    const txs = await (await import('../models/index.js')).Transaction.findAll({ where: { userId: String(req.user!.id) } });
    const out = { DEPOSIT: 0, WITHDRAW: 0, BET: 0, WIN: 0 } as Record<string, number>;
    for (const t of txs as any[]) out[String((t.type || '').toUpperCase())] = (out[String((t.type || '').toUpperCase())] || 0) + Number(t.amount || 0);
    res.json(out);
  } catch (e) { next(e); }
});

export default router;
