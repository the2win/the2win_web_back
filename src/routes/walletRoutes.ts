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

    // Enforce deposit limits: USDT or Cash Agent 10 - 100000
    if (amount < 10 || amount > 100000) return res.status(400).json({ message: 'Amount must be between 10 and 100000' });

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

    // Method-specific limits
    if (method === 'binance') {
      if (amount < 10 || amount > 5000) return res.status(400).json({ message: 'USDT withdraw amount must be between 10 and 5000' });
    } else if (method === 'bank_in' || method === 'cash_agent') {
      if (amount < 10 || amount > 100000) return res.status(400).json({ message: 'Amount must be between 10 and 100000' });
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

    // For binance, require destination address string
    if (method === 'binance') {
      if (!dest || dest.length < 10) return res.status(400).json({ message: 'Destination address required for USDT (Binance)' });
    }

    // Create withdraw request pending admin approval; funds can be held or debited on approval
    let finalDest: string | null = null;
    if (method === 'bank_in') {
      finalDest = req.body.dest as string; // constructed above
    } else if (method === 'binance') {
      finalDest = dest!;
    } else if (method === 'cash_agent') {
      // Optional note provided by user; otherwise mark as cash_agent
      finalDest = dest ? `cash_agent:${dest}` : 'cash_agent';
    }
    const rec = await WithdrawRequest.create({ id: nanoid(), userId: String(req.user!.id), amount: amount as any, method: method as any, dest: finalDest });
    res.json({ request: rec });
  } catch (e) { next(e); }
});

export default router;
