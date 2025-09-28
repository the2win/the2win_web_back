import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { crashGameService } from '../services/crashGameService.js';
import { pool } from '../config/db.js';
import { z } from 'zod';

const router = Router();

router.get('/state', (_req, res) => {
  const s = crashGameService.getState();
  res.json({ state: serializeState(s) });
});

router.get('/history', async (_req, res) => {
  // use in-memory first; fallback DB if empty
  const mem = crashGameService.getHistory(25);
  if (mem.length) return res.json({ history: mem });
  try {
    const [rows] = await pool.query<any[]>(`SELECT round_id as roundId, crash_point as crashPoint, crashed_at as crashedAt FROM crash_rounds WHERE crashed_at IS NOT NULL ORDER BY round_id DESC LIMIT 25`);
    return res.json({ history: (rows as any[]).map(r => ({ roundId: Number(r.roundId), crashPoint: r.crashPoint !== null ? Number(r.crashPoint) : null, crashedAt: r.crashedAt })) });
  } catch { return res.json({ history: [] }); }
});

// Server-Sent Events stream for live updates
router.get('/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const send = () => {
    const s = crashGameService.getState();
    const history = crashGameService.getHistory(25);
    res.write(`event: update\n`);
    res.write(`data: ${JSON.stringify({ state: serializeState(s), history })}\n\n`);
  };

  const listener = () => send();
  crashGameService.on('update', listener);
  // initial push
  send();

  req.on('close', () => {
    crashGameService.removeListener('update', listener as any);
  });
});

router.post('/bet', requireAuth, async (req, res) => {
  // Coerce string numbers from clients and validate
  const schema = z.object({ amount: z.coerce.number().positive(), slot: z.enum(['A','B']).optional() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid amount' });
  const userId = (req as any).user.id as string;
  const result: any = await crashGameService.placeBet(userId, parsed.data.amount, parsed.data.slot || 'A');
  if (!result.ok) {
    const message = result.message || 'Bet failed';
    return res.status(400).json({ message });
  }
  res.json({ message: 'Bet placed', balance: result.balance });
});

router.post('/cashout', requireAuth, async (req, res) => {
  const schema = z.object({ slot: z.enum(['A','B']).optional() });
  const parsed = schema.safeParse(req.body);
  const userId = (req as any).user.id as string;
  const result: any = await crashGameService.cashOut(userId, parsed.success ? parsed.data.slot : undefined);
  if (!result.ok) return res.status(400).json({ message: result.message || 'Cashout failed' });
  res.json({ message: 'Cashed out', payout: result.payout, balance: result.balance });
});

export default router;

function serializeState(s: any) {
  return {
    roundId: s.roundId,
    phase: s.phase,
    multiplier: s.multiplier,
    waitingEndsAt: s.waitingEndsAt,
    startTime: s.startTime,
    crashTime: s.crashTime,
    nextRoundStartsAt: s.nextRoundStartsAt,
    fair: {
      serverSeedHash: s.fair.serverSeedHash,
      // revealing crashPoint is fine (client needs it once crashed) but keep serverSeed if desired
      crashPoint: s.fair.crashPoint,
      serverSeed: s.fair.serverSeed, // prototype transparency
      nonce: s.fair.nonce
    },
    bets: s.bets.map((b: any) => ({
      userId: b.userId,
      slot: (b.slot ?? 'A'),
      amount: b.amount,
      cashedOut: b.cashedOut,
      cashoutMultiplier: b.cashoutMultiplier
    }))
  };
}