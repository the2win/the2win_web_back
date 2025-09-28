import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { addTransaction } from '../services/walletService.js';
import { z } from 'zod';
const router = Router();
// Simple in-memory mini games list
const games = [
    { id: 'dice', name: 'Dice Roll', minBet: 1, maxBet: 100 },
    { id: 'coinflip', name: 'Coin Flip', minBet: 1, maxBet: 200 }
];
router.get('/', (_req, res) => {
    res.json({ games });
});
router.post('/play', requireAuth, (req, res, next) => {
    try {
        const { gameId, bet } = z.object({ gameId: z.string(), bet: z.number().positive() }).parse(req.body);
        const game = games.find(g => g.id === gameId);
        if (!game)
            return res.status(400).json({ message: 'Game not found' });
        if (bet < game.minBet || bet > game.maxBet)
            return res.status(400).json({ message: 'Bet out of range' });
        addTransaction(String(req.user.id), 'BET', bet, { gameId });
        // simplistic win chance 50%
        const win = Math.random() < 0.5;
        if (win) {
            const winnings = bet * 2;
            addTransaction(String(req.user.id), 'WIN', winnings, { gameId });
            return res.json({ result: 'WIN', winnings });
        }
        res.json({ result: 'LOSE' });
    }
    catch (e) {
        next(e);
    }
});
export default router;
