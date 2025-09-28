import { Router } from 'express';
import { requireAuth, AuthedRequest } from '../middleware/auth.js';
import { wingoService, WingoColor } from '../services/wingoService.js';
import { z } from 'zod';

const router = Router();

// Local multipliers map (kept in sync with service)
const MULTS: Record<WingoColor, number> = { GREEN: 2, PURPLE: 3, RED: 5 };

function serializeState(s: any) {
  return {
    roundId: s.roundId,
    phase: s.phase,
    bettingEndsAt: s.bettingEndsAt,
    revealAt: s.revealAt,
    result: s.result ? { color: s.result as WingoColor, multiplier: MULTS[s.result as WingoColor] } : undefined,
    fair: {
      serverSeedHash: s.serverSeedHash,
      serverSeed: s.serverSeed,
      nonce: s.nonce
    },
    bets: Array.isArray(s.bets) ? s.bets.map((b: any) => ({
      userId: b.userId,
      amount: b.amount,
      color: b.selection as WingoColor,
      won: b.win,
      payout: typeof b.payoutMultiplier === 'number' && b.win ? +(b.amount * b.payoutMultiplier).toFixed(2) : undefined
    })) : [],
    history: Array.isArray(s.history) ? s.history.map((h: any) => ({
      roundId: h.roundId,
      color: h.result as WingoColor,
      multiplier: MULTS[h.result as WingoColor]
    })) : []
  };
}

router.get('/state', (_req, res) => {
  res.json({ state: serializeState(wingoService.getPublicState()) });
});

router.get('/stream', (req: AuthedRequest, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive'
  });
  const send = () => {
    const payload = JSON.stringify({ state: serializeState(wingoService.getPublicState()) });
    res.write(`event: update\n`);
    res.write(`data: ${payload}\n\n`);
  };
  send();
  const listener = () => send();
  wingoService.on(listener);
  req.on('close', () => wingoService.remove(listener));
});

router.post('/bet', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const { selection, amount } = z.object({ selection: z.enum(['GREEN','PURPLE','RED']), amount: z.number().positive() }).parse(req.body);
  const result = await wingoService.placeBet(String(req.user!.id), selection as WingoColor, amount);
  if (!result.ok) return res.status(400).json({ message: (result as any).message });
    res.json({ ok:true });
  } catch (e) { next(e); }
});

export default router;
