// (Removed initial temporary stub implementation)
import { EventEmitter } from 'events';
import { pool } from '../config/db.js';
import { WingoRound, WingoBet as WingoBetModel } from '../models/index.js';
import { addTransaction, getBalance } from './walletService.js';
import { generateServerSeed, hashServerSeed } from '../utils/fairness.js';
import crypto from 'crypto';
import { AdminOverride } from '../models/index.js';
const ROUND_DURATION_MS = 30000; // 30s betting window
const REVEAL_DELAY_MS = 2000; // short reveal animation time
const HISTORY_LIMIT = 50;
const MULTIPLIERS = { GREEN: 2, PURPLE: 3, RED: 5 };
class WingoService {
    constructor() {
        this.emitter = new EventEmitter();
        this.roundCounter = 1;
        this.nonce = 1;
        this.state = this.buildNewRound();
        this.scheduleEnd();
    }
    buildNewRound() {
        const serverSeed = generateServerSeed();
        const serverSeedHash = hashServerSeed(serverSeed);
        return {
            roundId: this.roundCounter++,
            phase: 'betting',
            bettingEndsAt: Date.now() + ROUND_DURATION_MS,
            serverSeedHash,
            serverSeed, // for production you'd delay reveal until after result
            nonce: this.nonce,
            bets: [],
            history: this.state?.history || []
        };
    }
    scheduleEnd() {
        const ms = Math.max(0, this.state.bettingEndsAt - Date.now());
        this.timer = setTimeout(() => this.closeBetting(), ms);
    }
    emit() { this.emitter.emit('update', this.getPublicState()); }
    on(listener) { this.emitter.on('update', listener); }
    remove(listener) { this.emitter.removeListener('update', listener); }
    deriveResult() {
        // Use first byte of sha256(serverSeed:nonce) to map to color distribution weights
        const h = crypto.createHash('sha256').update(`${this.state.serverSeed}:${this.state.nonce}`).digest();
        const byte = h[0];
        // Weighting: GREEN 60%, PURPLE 30%, RED 10%
        const pct = byte / 255; // 0..1
        if (pct < 0.60)
            return 'GREEN';
        if (pct < 0.90)
            return 'PURPLE';
        return 'RED';
    }
    async closeBetting() {
        if (this.state.phase !== 'betting')
            return;
        this.state.phase = 'revealing';
        this.state.revealAt = Date.now() + REVEAL_DELAY_MS;
        // determine result
        let result = this.deriveResult();
        try {
            const ov = await AdminOverride.findOne({ where: { game: 'wingo', consumedAtMs: null }, order: [['createdAtMs', 'ASC']] });
            if (ov && ov.payload?.color) {
                result = ov.payload.color;
                ov.consumedAtMs = Date.now();
                await ov.save();
            }
        }
        catch { }
        this.state.result = result;
        await this.settleBets(result);
        this.emit();
        setTimeout(() => this.startNextRound(), REVEAL_DELAY_MS);
    }
    async settleBets(result) {
        for (const bet of this.state.bets) {
            if (bet.selection === result) {
                bet.win = true;
                bet.payoutMultiplier = MULTIPLIERS[result];
                const payout = +(bet.amount * MULTIPLIERS[result]).toFixed(2);
                try {
                    await addTransaction(bet.userId, 'WIN', payout, { roundId: this.state.roundId, game: 'wingo', result, multiplier: MULTIPLIERS[result] });
                }
                catch { }
            }
            else {
                bet.win = false;
            }
        }
        // persist round & bets
        this.persistRound();
    }
    async persistRound() {
        try {
            await WingoRound.upsert({
                roundId: this.state.roundId,
                serverSeedHash: this.state.serverSeedHash,
                serverSeed: this.state.serverSeed,
                nonce: this.state.nonce,
                result: this.state.result,
                bettingEndsAt: this.state.bettingEndsAt,
                revealedAt: this.state.revealAt,
            });
            return;
        }
        catch { }
        try {
            await pool.query(`INSERT INTO wingo_rounds (round_id, server_seed_hash, server_seed, nonce, result, betting_ends_at, revealed_at) VALUES (?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE result=VALUES(result), server_seed=VALUES(server_seed), revealed_at=VALUES(revealed_at)`, [
                this.state.roundId,
                this.state.serverSeedHash,
                this.state.serverSeed,
                this.state.nonce,
                this.state.result,
                this.state.bettingEndsAt,
                this.state.revealAt
            ]);
        }
        catch { }
    }
    async persistBet(bet) {
        try {
            await WingoBetModel.create({ id: crypto.randomUUID(), roundId: this.state.roundId, userId: bet.userId, selection: bet.selection, amount: bet.amount, createdAtMs: Date.now() });
            return;
        }
        catch { }
        try {
            await pool.query(`INSERT INTO wingo_bets (id, round_id, user_id, selection, amount, created_at) VALUES (UUID(),?,?,?,?, NOW())`, [
                this.state.roundId,
                bet.userId,
                bet.selection,
                bet.amount
            ]);
        }
        catch { }
    }
    startNextRound() {
        // push history entry
        if (this.state.result && this.state.serverSeed) {
            this.state.history.unshift({ roundId: this.state.roundId, result: this.state.result, serverSeed: this.state.serverSeed, serverSeedHash: this.state.serverSeedHash });
            if (this.state.history.length > HISTORY_LIMIT)
                this.state.history.length = HISTORY_LIMIT;
        }
        this.nonce++;
        this.state = this.buildNewRound();
        this.scheduleEnd();
        this.emit();
    }
    getPublicState() {
        const { roundId, phase, bettingEndsAt, revealAt, result, serverSeedHash, serverSeed, nonce, bets } = this.state;
        return {
            roundId, phase, bettingEndsAt, revealAt, result, serverSeedHash, serverSeed, nonce,
            bets: bets.map(b => ({ userId: b.userId, selection: b.selection, amount: b.amount, win: b.win, payoutMultiplier: b.payoutMultiplier })),
            history: this.state.history
        };
    }
    async placeBet(userId, selection, amount) {
        if (this.state.phase !== 'betting')
            return { ok: false, message: 'Betting closed' };
        if (amount <= 0)
            return { ok: false, message: 'Invalid amount' };
        let bal = 0;
        try {
            bal = await getBalance(userId);
        }
        catch {
            return { ok: false, message: 'User not found' };
        }
        if (bal < amount)
            return { ok: false, message: 'Insufficient balance' };
        // allow multiple bets; just record
        try {
            await addTransaction(userId, 'BET', amount, { roundId: this.state.roundId, game: 'wingo', selection });
        }
        catch (e) {
            return { ok: false, message: e.message || 'Bet failed' };
        }
        const bet = { userId, selection, amount };
        this.state.bets.push(bet);
        this.persistBet(bet);
        this.emit();
        return { ok: true };
    }
}
export const wingoService = new WingoService();
