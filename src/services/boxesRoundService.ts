import { EventEmitter } from 'events';
import crypto from 'crypto';
import { addTransaction, getBalance } from './walletService.js';
import { pool } from '../config/db.js';
import { AdminOverride } from '../models/index.js';

type Phase = 'waiting' | 'locked' | 'revealed';

interface BoxesBet { userId: string; boxIndex: number; amount: number; }
interface Winner { idx: number; multiplier: number; }
interface BoxesState {
  roundId: number;
  phase: Phase;
  waitingEndsAt: number;
  lockedEndsAt?: number;
  revealedAt?: number;
  settledAt?: number;
  totals: number[]; // total bet per box
  counts: number[]; // bet count per box
  fair: { serverSeedHash: string; serverSeed?: string; nonce: number };
  winners?: Winner[];
}

export class BoxesRoundService {
  private emitter = new EventEmitter();
  private roundCounter = 1;
  private nonce = 1;
  private WAITING_DURATION = 10000; // 10s betting
  private LOCKED_DURATION = 3000; // 3s lock before reveal
  private state: BoxesState;
  private bets: BoxesBet[] = [];
  private history: Array<{ roundId:number; winners: Winner[]; revealedAt:number }> = [];

  constructor() {
    this.state = this.buildWaitingState();
    setTimeout(() => this.startLocked(), this.timeToWaitingEnd());
  }

  on(event: 'update', listener: (s: BoxesState) => void) { this.emitter.on(event, listener); }
  removeListener(event: 'update', listener: (s: BoxesState) => void) { this.emitter.removeListener(event, listener); }
  private emitUpdate() { this.emitter.emit('update', this.state); }

  public getState() { return this.state; }
  public getHistory(limit=25) { return this.history.slice(0, limit); }

  private buildWaitingState(): BoxesState {
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

  private timeToWaitingEnd() { return Math.max(0, this.state.waitingEndsAt - Date.now()); }

  private startLocked() {
    if (this.state.phase !== 'waiting') return;
    this.state.phase = 'locked';
    this.state.lockedEndsAt = Date.now() + this.LOCKED_DURATION;
    this.persistRoundPartial();
    this.emitUpdate();
  setTimeout(() => { this.reveal(); }, this.LOCKED_DURATION);
  }

  private async reveal() {
    if (this.state.phase !== 'locked') return;
    // Determine winners constrained to boxes with at least one bet (opponents betted boxes)
    const totals = this.state.totals.map(Number);
    const all = totals.map((sum, idx) => ({ idx, sum }));
    const betted = all.filter(x => x.sum > 0).sort((a,b)=> a.sum - b.sum);
    const winners: Winner[] = [];
    const used = new Set<number>();

    // 0) Admin override, if queued
    // Consume the oldest unconsumed override for boxes
    let overrideApplied = false;
    try {
      const ov = await AdminOverride.findOne({ where: { game: 'boxes', consumedAtMs: null }, order: [['createdAtMs','ASC']] as any });
      if (ov && Array.isArray(ov.payload?.winners) && ov.payload.winners.length) {
        for (const w of ov.payload.winners as any[]) {
          if (typeof w?.idx === 'number' && (w.idx>=0&&w.idx<=9) && (w.multiplier===2||w.multiplier===3||w.multiplier===5)) {
            winners.push({ idx: w.idx, multiplier: w.multiplier });
            used.add(w.idx);
          }
        }
        ov.consumedAtMs = Date.now() as any; await ov.save();
        overrideApplied = winners.length > 0;
      }
    } catch {}

    // 1) Ensure winners are among betted boxes only
    const pickFromBetted = (preferLeast=true) => {
      const pool = preferLeast ? betted : betted.slice().reverse();
      const found = pool.find(p => !used.has(p.idx));
      if (found) { used.add(found.idx); return found.idx; }
      return undefined;
    };

    // 2) Base pattern: choose 3 distinct betted boxes, bias towards least total to reduce payout
    while (winners.length < 3) {
      const idx = pickFromBetted(true);
      if (typeof idx !== 'number') break;
      const assignedMultipliers = winners.map(w=>w.multiplier);
      const nextMult = [5,3,2].find(m => !assignedMultipliers.includes(m)) || 2;
      winners.push({ idx, multiplier: nextMult as 2|3|5 });
    }

    // 3) Loyalty boost: users with >5 lifetime boxes bets get a small chance to upgrade 2x->3x or 3x->5x on their chosen box
    try {
      const recentBets = this.bets.slice();
      // Count plays per user historically (best-effort via DB quick query per involved user)
      const uniqueUsers = Array.from(new Set(recentBets.map(b=>b.userId)));
      const eligible = new Set<string>();
      for (const uid of uniqueUsers) {
        try {
          const [rows]: any = await pool.query(`SELECT COUNT(*) c FROM boxes_bets WHERE user_id=?`, [uid]);
          const c = Number(rows?.[0]?.c || 0);
          if (c >= 5) eligible.add(uid);
        } catch {}
      }
      // If any eligible user bet on a currently 2x or 3x box, chance to bump multiplier
      for (const w of winners) {
        const hasEligibleOnBox = recentBets.some(b => b.boxIndex === w.idx && eligible.has(b.userId));
        if (hasEligibleOnBox) {
          const r = Math.random();
          if (w.multiplier === 2 && r < 0.25) w.multiplier = 3; // 25% upgrade chance
          else if (w.multiplier === 3 && r < 0.15) w.multiplier = 5; // 15% upgrade chance
        }
      }
    } catch {}

    // Safety: if no one bet anywhere (edge case), keep current logic but random among all boxes
    if (betted.length === 0) {
      const freeIdxs = new Set<number>(Array.from({length:10}, (_,i)=>i));
      for (const w of winners) freeIdxs.delete(w.idx);
      while (winners.length < 3 && freeIdxs.size) {
        const idx = Array.from(freeIdxs)[Math.floor(Math.random()*freeIdxs.size)];
        freeIdxs.delete(idx);
        const assignedMultipliers = winners.map(w=>w.multiplier);
        const nextMult = [5,3,2].find(m => !assignedMultipliers.includes(m)) || 2;
        winners.push({ idx, multiplier: nextMult as 2|3|5 });
      }
    }

    const poolAmt = totals.reduce((a,b)=>a+b,0);
    const payoutSum = (arr: Winner[]) => arr.reduce((acc,w)=> acc + totals[w.idx] * w.multiplier, 0);
    // No hard enforcement below pool since winners restricted to betted boxes already biases payout; but cap extreme payout if accidental override
    let payout = payoutSum(winners);
    if (poolAmt > 0 && payout > poolAmt * 1.2) {
      // reduce highest multiplier to lower next tier
      const idx5 = winners.findIndex(w=>w.multiplier===5);
      if (idx5 !== -1) { winners[idx5].multiplier = 3; payout = payoutSum(winners); }
      if (payout > poolAmt * 1.2) {
        const idx3 = winners.findIndex(w=>w.multiplier===3);
        if (idx3 !== -1) { winners[idx3].multiplier = 2; }
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
    if (this.history.length > 50) this.history.length = 50;
    this.persistRoundReveal();
    this.emitUpdate();

    // Schedule next round
    setTimeout(() => this.startNextWaiting(), 4000);
  }

  private async settlePayouts(winners: Winner[]) {
    const winnerIdxSet = new Set(winners.map(w=>w.idx));
    const multiplierMap = new Map<number, number>(winners.map(w=>[w.idx, w.multiplier] as const));
    // aggregate by user to reduce queries
    const byUser = new Map<string, number>();
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
        try { await addTransaction(userId, 'WIN', payout, { game:'boxes', roundId: this.state.roundId }); } catch {}
      }
    }
  }

  private startNextWaiting() {
    this.nonce++;
    this.bets = [];
    this.state = this.buildWaitingState();
    this.emitUpdate();
    setTimeout(() => this.startLocked(), this.timeToWaitingEnd());
  }

  public async placeBet(userId: string, amount: number, boxIndex: number) {
    if (this.state.phase !== 'waiting') return { ok:false, message: 'Betting closed' };
    if (!Number.isFinite(amount) || amount <= 0) return { ok:false, message:'Invalid amount' };
    if (amount < 20) return { ok:false, message:'Minimum bet is 20' };
    if (boxIndex < 0 || boxIndex > 9) return { ok:false, message:'Invalid box' };
    let balance = 0;
    try { balance = await getBalance(userId); } catch { return { ok:false, message:'User not found' }; }
    if (balance < amount) return { ok:false, message:'Insufficient balance' };
    let balanceAfter: number | undefined;
    try {
      const tx: any = await addTransaction(userId, 'BET', amount, { game:'boxes', roundId: this.state.roundId, boxIndex });
      balanceAfter = typeof tx?.balance === 'number' ? tx.balance : undefined;
    } catch (e: any) { return { ok:false, message: e.message || 'Bet failed' }; }
    // record bet
    this.bets.push({ userId, amount, boxIndex });
    this.state.totals[boxIndex] += amount;
    this.state.counts[boxIndex] += 1;
    this.persistBet(userId, amount, boxIndex);
    this.emitUpdate();
    return { ok:true, balance: balanceAfter };
  }

  // Persistence (best-effort)
  private async persistRoundPartial() {
    try {
      await pool.query(`INSERT INTO boxes_rounds (round_id, server_seed_hash, nonce, waiting_ends_at, locked_ends_at) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE locked_ends_at=VALUES(locked_ends_at)`, [
        this.state.roundId, this.state.fair.serverSeedHash, this.state.fair.nonce, this.state.waitingEndsAt, this.state.lockedEndsAt
      ]);
    } catch {}
  }
  private async persistRoundReveal() {
    try {
      await pool.query(`UPDATE boxes_rounds SET revealed_at=?, winners_json=? WHERE round_id=?`, [
        this.state.revealedAt, JSON.stringify(this.state.winners || []), this.state.roundId
      ]);
    } catch {}
  }
  private async persistBet(userId: string, amount: number, boxIndex: number) {
    try { await pool.query(`INSERT INTO boxes_bets (id, round_id, user_id, amount, box_index, created_at) VALUES (UUID(),?,?,?,?, NOW())`, [this.state.roundId, userId, amount, boxIndex]); } catch {}
  }
}

export const boxesRoundService = new BoxesRoundService();
