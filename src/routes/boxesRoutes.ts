import { Router } from 'express';
import { requireAuth, AuthedRequest } from '../middleware/auth.js';
import { boxesService } from '../services/boxesService.js';
import { boxesRoundService } from '../services/boxesRoundService.js';
import { z } from 'zod';

const router = Router();

router.post('/play', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const { amount, boxIndex } = z.object({ amount: z.coerce.number().positive().min(20, 'Minimum bet is 20'), boxIndex: z.coerce.number().int().min(0).max(9) }).parse(req.body);
    const result = await boxesService.play(String(req.user!.id), amount, boxIndex);
    if (!result.ok) return res.status(400).json({ message: result.message });
    res.json({ play: result.play, balance: result.balance });
  } catch (e) { next(e); }
});

router.get('/history', requireAuth, (req: AuthedRequest, res) => {
  res.json({ history: boxesService.getHistory(String(req.user!.id)) });
});

// Round-based live stream (SSE)
router.get('/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const send = () => {
    res.write(`event: update\n`);
    res.write(`data: ${JSON.stringify({ state: boxesRoundService.getState(), history: boxesRoundService.getHistory() })}\n\n`);
  };
  send();
  const listener = () => send();
  boxesRoundService.on('update', listener as any);
  req.on('close', () => boxesRoundService.removeListener('update', listener as any));
});

// Round-based betting entry point
router.post('/bet', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const { amount, boxIndex } = z.object({ amount: z.coerce.number().positive().min(20, 'Minimum bet is 20'), boxIndex: z.coerce.number().int().min(0).max(9) }).parse(req.body);
    const r = await boxesRoundService.placeBet(String(req.user!.id), amount, boxIndex);
    if (!r.ok) return res.status(400).json({ message: r.message });
    res.json({ ok: true, balance: r.balance });
  } catch (e) { next(e); }
});

export default router;
