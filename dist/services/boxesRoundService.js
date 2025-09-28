import { EventEmitter } from 'events';
import crypto from 'crypto';
import { addTransaction, getBalance } from './walletService.js';
import { pool } from '../config/db.js';
export class BoxesRoundService {
    constructor() {
        this.emitter = new EventEmitter();
        this.roundCounter = 1;
        this.nonce = 1;
        this.WAITING_DURATION = 10000; // 10s betting
        this.LOCKED_DURATION = 3000; // 3s lock before reveal
        this.bets = [];
        this.history = [];
        this.state = this.buildWaitingState();
        setTimeout(() => this.startLocked(), this.timeToWaitingEnd());
    }
    on(event, listener) { this.emitter.on(event, listener); }
    removeListener(event, listener) { this.emitter.removeListener(event, listener); }
    emitUpdate() { this.emitter.emit('update', this.state); }
    getState() { return this.state; }
    getHistory(limit = 25) { return this.history.slice(0, limit); }
    buildWaitingState() {
        const serverSeed = crypto.randomBytes(32).toString('hex');
        const serverSeedHash = crypto.createHash('sha256').update(serverSeed).digest('hex');
        return {
            roundId: this.roundCounter++,
            phase: 'waiting',
            waitingEndsAt: Date.now() + this.WAITING_DURATION,
            totals: Array(10).fill(0),
            counts: Array(10).fill(0),
            fair: { serverSeedHash, serverSeed, nonce: this.nonce }
        };
    }
    timeToWaitingEnd() { return Math.max(0, this.state.waitingEndsAt - Date.now()); }
    startLocked() {
        if (this.state.phase !== 'waiting')
            return;
        this.state.phase = 'locked';
        this.state.lockedEndsAt = Date.now() + this.LOCKED_DURATION;
        this.persistRoundPartial();
        this.emitUpdate();
        setTimeout(() => this.reveal(), this.LOCKED_DURATION);
    }
    reveal() {
        if (this.state.phase !== 'locked')
            return;
        // Determine winners with house-favoring logic
        const totals = this.state.totals.map(Number);
        const all = totals.map((sum, idx) => ({ idx, sum }));
        const positive = all.filter(x => x.sum > 0).sort((a, b) => a.sum - b.sum);
        const zeros = all.filter(x => x.sum === 0).map(x => x.idx);
        // 1) Enforce request: least bet positive box gets 3x (if any positive exists)
        const winners = [];
        const used = new Set();
        if (positive.length) {
            winners.push({ idx: positive[0].idx, multiplier: 3 });
            used.add(positive[0].idx);
        }
        // 2) House favor: Prefer 5x and 2x on zero-bet boxes to minimize payout
        const takeZero = () => {
            const z = zeros.find(z => !used.has(z));
            if (typeof z === 'number') {
                used.add(z);
                return z;
            }
            return undefined;
        };
        // pick for 5x, prefer zero; else next least positive not yet used
        let fiveIdx = takeZero();
        if (fiveIdx === undefined) {
            const nextPos = positive.find(p => !used.has(p.idx));
            fiveIdx = nextPos ? nextPos.idx : all.find(x => !used.has(x.idx))?.idx;
        }
        if (typeof fiveIdx === 'number')
            winners.push({ idx: fiveIdx, multiplier: 5 });
        // pick for 2x, prefer zero; else next least available
        let twoIdx = takeZero();
        if (twoIdx === undefined) {
            const nextPos = positive.find(p => !used.has(p.idx));
            twoIdx = nextPos ? nextPos.idx : all.find(x => !used.has(x.idx))?.idx;
        }
        if (typeof twoIdx === 'number')
            winners.push({ idx: twoIdx, multiplier: 2 });
        // ensure we have exactly 3 winners (fill any missing with remaining zeros/any)
        while (winners.length < 3) {
            const idx = all.find(x => !used.has(x.idx))?.idx;
            if (typeof idx === 'number') {
                used.add(idx);
                const mult = winners.some(w => w.multiplier === 5) ? (winners.some(w => w.multiplier === 2) ? 3 : 2) : 5;
                winners.push({ idx, multiplier: mult });
            }
            else
                break;
        }
        const pool = totals.reduce((a, b) => a + b, 0);
        const payoutSum = (arr) => arr.reduce((acc, w) => acc + totals[w.idx] * w.multiplier, 0);
        let payout = payoutSum(winners);
        // 3) Guarantee operator income when pool > 0: push payout strictly below pool by swapping in zeros
        if (pool > 0 && payout >= pool) {
            // try to replace 5x then 2x with zeros
            const replaceWithZero = (mult) => {
                const zi = zeros.find(z => !winners.some(w => w.idx === z));
                if (zi === undefined)
                    return false;
                const idx = winners.findIndex(w => w.multiplier === mult && totals[w.idx] > 0);
                if (idx === -1)
                    return false;
                winners[idx] = { idx: zi, multiplier: mult };
                payout = payoutSum(winners);
                return true;
            };
            if (payout >= pool)
                replaceWithZero(5);
            if (payout >= pool)
                replaceWithZero(2);
            // as last resort, if still >= pool and there are multiple positives, move 5x to least positive among remaining
            if (payout >= pool) {
                const posUnused = positive.filter(p => winners.every(w => w.idx !== p.idx));
                if (posUnused.length) {
                    const idx = winners.findIndex(w => w.multiplier === 5);
                    if (idx !== -1) {
                        winners[idx] = { idx: posUnused[0].idx, multiplier: 5 };
                        payout = payoutSum(winners);
                    }
                }
            }
        }
        this.state.phase = 'revealed';
        this.state.revealedAt = Date.now();
        this.state.winners = winners;
        // Settle payouts per user bet; when finished, flag settledAt and emit another update
        this.settlePayouts(winners)
            .then(() => { this.state.settledAt = Date.now(); this.emitUpdate(); })
            .catch(() => { this.state.settledAt = Date.now(); this.emitUpdate(); });
        // Persist and rotate history
        this.history.unshift({ roundId: this.state.roundId, winners: winners.slice(), revealedAt: this.state.revealedAt });
        if (this.history.length > 50)
            this.history.length = 50;
        this.persistRoundReveal();
        this.emitUpdate();
        // Schedule next round
        setTimeout(() => this.startNextWaiting(), 4000);
    }
    async settlePayouts(winners) {
        const winnerIdxSet = new Set(winners.map(w => w.idx));
        const multiplierMap = new Map(winners.map(w => [w.idx, w.multiplier]));
        // aggregate by user to reduce queries
        const byUser = new Map();
        for (const b of this.bets) {
            if (winnerIdxSet.has(b.boxIndex)) {
                const m = multiplierMap.get(b.boxIndex) || 0;
                const inc = +(b.amount * m).toFixed(2);
                byUser.set(b.userId, (byUser.get(b.userId) || 0) + inc);
            }
        }
        // credit winners
        for (const [userId, payout] of byUser.entries()) {
            if (payout > 0) {
                try {
                    await addTransaction(userId, 'WIN', payout, { game: 'boxes', roundId: this.state.roundId });
                }
                catch { }
            }
        }
    }
    startNextWaiting() {
        this.nonce++;
        this.bets = [];
        this.state = this.buildWaitingState();
        this.emitUpdate();
        setTimeout(() => this.startLocked(), this.timeToWaitingEnd());
    }
    async placeBet(userId, amount, boxIndex) {
        if (this.state.phase !== 'waiting')
            return { ok: false, message: 'Betting closed' };
        if (!Number.isFinite(amount) || amount <= 0)
            return { ok: false, message: 'Invalid amount' };
        if (amount < 20)
            return { ok: false, message: 'Minimum bet is 20' };
        if (boxIndex < 0 || boxIndex > 9)
            return { ok: false, message: 'Invalid box' };
        let balance = 0;
        try {
            balance = await getBalance(userId);
        }
        catch {
            return { ok: false, message: 'User not found' };
        }
        if (balance < amount)
            return { ok: false, message: 'Insufficient balance' };
        let balanceAfter;
        try {
            const tx = await addTransaction(userId, 'BET', amount, { game: 'boxes', roundId: this.state.roundId, boxIndex });
            balanceAfter = typeof tx?.balance === 'number' ? tx.balance : undefined;
        }
        catch (e) {
            return { ok: false, message: e.message || 'Bet failed' };
        }
        // record bet
        this.bets.push({ userId, amount, boxIndex });
        this.state.totals[boxIndex] += amount;
        this.state.counts[boxIndex] += 1;
        this.persistBet(userId, amount, boxIndex);
        this.emitUpdate();
        return { ok: true, balance: balanceAfter };
    }
    // Persistence (best-effort)
    async persistRoundPartial() {
        try {
            await pool.query(`INSERT INTO boxes_rounds (round_id, server_seed_hash, nonce, waiting_ends_at, locked_ends_at) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE locked_ends_at=VALUES(locked_ends_at)`, [
                this.state.roundId, this.state.fair.serverSeedHash, this.state.fair.nonce, this.state.waitingEndsAt, this.state.lockedEndsAt
            ]);
        }
        catch { }
    }
    async persistRoundReveal() {
        try {
            await pool.query(`UPDATE boxes_rounds SET revealed_at=?, winners_json=? WHERE round_id=?`, [
                this.state.revealedAt, JSON.stringify(this.state.winners || []), this.state.roundId
            ]);
        }
        catch { }
    }
    async persistBet(userId, amount, boxIndex) {
        try {
            await pool.query(`INSERT INTO boxes_bets (id, round_id, user_id, amount, box_index, created_at) VALUES (UUID(),?,?,?,?, NOW())`, [this.state.roundId, userId, amount, boxIndex]);
        }
        catch { }
    }
}
export const boxesRoundService = new BoxesRoundService();
