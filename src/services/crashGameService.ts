// (Removed initial simplified stub section)
import { addTransaction, getBalance } from './walletService.js';
import { EventEmitter } from 'events';
import { generateServerSeed, hashServerSeed, computeCrashPoint, FairRoundData } from '../utils/fairness.js';
import { pool } from '../config/db.js';
import { AdminOverride, CrashPattern } from '../models/index.js';

interface CrashBet {
  userId: string;
  slot: 'A' | 'B';
  amount: number;
  cashedOut: boolean;
  cashoutMultiplier?: number;
}

type Phase = 'waiting' | 'locked' | 'running' | 'crashed';

interface CrashRoundState {
  roundId: number;
  phase: Phase;
  startTime?: number; // running start
  crashTime?: number; // timestamp when crash occurred
  multiplier: number;
  bets: CrashBet[];
  fair: FairRoundData;
  waitingEndsAt: number; // timestamp when waiting ends
  lockedEndsAt?: number; // timestamp when locked ends
  nextRoundStartsAt?: number; // after crash cooldown
}

// Simple crash curve generator: exponential growth until random crash point.
// Crash point distribution (rough approximation) using random fairness placeholder.
function generateCrashPoint(): number {
  // Avoid extremely low always: min 1.0x; heavy tail chance for big multipliers
  const r = Math.random();
  // Piecewise distribution for variety
  if (r < 0.60) return +(1 + Math.random() * 1.5).toFixed(2); // 1.0 - 2.5x
  if (r < 0.85) return +(2.5 + Math.random() * 2.5).toFixed(2); // 2.5 - 5x
  if (r < 0.97) return +(5 + Math.random() * 5).toFixed(2); // 5 - 10x
  return +(10 + Math.random() * 30).toFixed(2); // 10 - 40x rare
}

class CrashGameService {
  private state: CrashRoundState;
  private tickTimer?: NodeJS.Timeout;
  private roundCounter = 1;
  private nonce = 1;
  private emitter = new EventEmitter();
  private history: { roundId:number; crashPoint:number; crashedAt:number }[] = [];

  private WAITING_DURATION = 5000; // ms betting window
  private LOCKED_DURATION = 3000; // ms locked (no new bets)
  private COOLDOWN_DURATION = 4000; // ms after crash
  private TICK_INTERVAL = 120; // ms for running

  constructor() {
    this.state = this.buildWaitingState();
    // transition from waiting -> locked then locked -> running
    setTimeout(() => this.startLockedPhase(), this.timeToWaitingEnd());
  }

  on(event: 'update', listener: (s: CrashRoundState) => void) {
    this.emitter.on(event, listener);
  }

  removeListener(event: 'update', listener: (s: CrashRoundState) => void) {
    this.emitter.removeListener(event, listener);
  }

  private emitUpdate() {
    this.emitter.emit('update', this.state);
  }

  private buildWaitingState(): CrashRoundState {
    const serverSeed = generateServerSeed();
    const serverSeedHash = hashServerSeed(serverSeed);
    const fair: FairRoundData = {
      serverSeedHash,
      // For stronger fairness you would delay revealing serverSeed until after next round.
      serverSeed, // Prototype: reveal immediately for transparency
      nonce: this.nonce,
      crashPoint: 0 // filled when computing at round start
    };
    return {
      roundId: this.roundCounter++,
      phase: 'waiting',
      multiplier: 1,
      bets: [],
      fair,
      waitingEndsAt: Date.now() + this.WAITING_DURATION
    };
  }

  private timeToWaitingEnd() {
    return Math.max(0, this.state.waitingEndsAt - Date.now());
  }

  private startLockedPhase() {
    if (this.state.phase !== 'waiting') return;
    this.state.phase = 'locked';
    this.state.lockedEndsAt = Date.now() + this.LOCKED_DURATION;
    this.persistRoundPartial();
    this.emitUpdate();
    setTimeout(() => this.startRound(), this.LOCKED_DURATION);
  }

  private startRound() {
    if (this.state.phase !== 'locked') return;
    // Determine crash point, prefer admin override when available
    let crashPoint = computeCrashPoint(this.state.fair.serverSeed!, this.state.fair.nonce);
    (async () => {
      try {
        // Apply active pattern if any
        try {
          const pattern = await CrashPattern.findOne({ where: { active: true } });
          if (pattern && Array.isArray(pattern.sequence) && pattern.sequence.length) {
            const idx = Math.max(0, Math.min(pattern.currentIndex || 0, pattern.sequence.length - 1));
            const p = Number(pattern.sequence[idx]);
            if (!isNaN(p) && p > 1) crashPoint = p;
            // advance index cyclically
            pattern.currentIndex = (idx + 1) % pattern.sequence.length;
            await pattern.save();
          }
        } catch {}
  const ov = await AdminOverride.findOne({ where: { game: 'crash', consumedAtMs: null }, order: [['createdAtMs','ASC']] });
        if (ov && ov.payload?.crashPoint) {
          crashPoint = Number(ov.payload.crashPoint);
          ov.consumedAtMs = Date.now() as any;
          await ov.save();
        }
        this.state.fair.crashPoint = crashPoint;
        this.state.phase = 'running';
        this.state.startTime = Date.now();
        this.state.multiplier = 1;
        this.persistRoundStart();
        this.emitUpdate();
        this.tickTimer = setInterval(() => this.tick(), this.TICK_INTERVAL);
      } catch {
        this.state.fair.crashPoint = crashPoint;
        this.state.phase = 'running';
        this.state.startTime = Date.now();
        this.state.multiplier = 1;
        this.persistRoundStart();
        this.emitUpdate();
        this.tickTimer = setInterval(() => this.tick(), this.TICK_INTERVAL);
      }
    })();
  }

  private finishRoundCrash() {
    if (this.tickTimer) clearInterval(this.tickTimer);
    this.state.phase = 'crashed';
    this.state.crashTime = Date.now();
    this.state.nextRoundStartsAt = Date.now() + this.COOLDOWN_DURATION;
    this.persistRoundCrash();
    // history push
    if (this.state.fair.crashPoint) {
      this.history.unshift({ roundId: this.state.roundId, crashPoint: this.state.fair.crashPoint, crashedAt: this.state.crashTime });
      if (this.history.length > 50) this.history.length = 50;
      this.pruneDbHistory();
    }
    this.emitUpdate();
    setTimeout(() => this.startNextWaitingRound(), this.COOLDOWN_DURATION);
  }

  private startNextWaitingRound() {
    this.nonce++;
    this.state = this.buildWaitingState();
    this.emitUpdate();
    setTimeout(() => this.startLockedPhase(), this.timeToWaitingEnd());
  }

  private tick() {
    if (this.state.phase !== 'running') return;
    const elapsed = (Date.now() - (this.state.startTime || 0)) / 1000; // seconds
  // Slower smooth growth: logistic-style easing toward high values
  // base function: m = 1 + (e^(k*t) - 1) * scale
  const k = 0.55; // growth rate
  const scale = 0.35; // overall speed scaler
  const raw = 1 + (Math.exp(k * elapsed) - 1) * scale; // starts gentle then accelerates
  this.state.multiplier = +raw.toFixed(2);
    if (this.state.fair.crashPoint && this.state.multiplier >= this.state.fair.crashPoint) {
      this.state.multiplier = this.state.fair.crashPoint;
      this.finishRoundCrash();
    } else {
      this.emitUpdate();
    }
  }

  public getState(): CrashRoundState { return this.state; }
  public getHistory(limit=50) { return this.history.slice(0, limit); }

  public async placeBet(userId: string, amount: number, slot: 'A'|'B' = 'A') {
    if (this.state.phase !== 'waiting') return { ok: false, message: 'Betting closed' };
  if (!isFinite(amount) || amount <= 0) return { ok: false, message: 'Invalid amount' };
  if (amount < 20) return { ok:false, message: 'Minimum bet is 20' };
    let bal = 0;
    try { bal = await getBalance(userId); } catch { return { ok:false, message: 'User not found' }; }
    if (bal < amount) return { ok:false, message: 'Insufficient balance' };
    if (this.state.bets.some(b => b.userId === userId && b.slot === slot)) return { ok: false, message: 'Already bet this round in this slot' };
    let balance: number | undefined = undefined;
    try {
      const tx: any = await addTransaction(userId, 'BET', amount, { roundId: this.state.roundId, slot });
      balance = typeof tx?.balance === 'number' ? tx.balance : undefined;
      // Optionally notify listeners about balance change (if any consumer cares)
      this.emitter.emit('update', this.state);
    } catch (e: any) { return { ok: false, message: e.message || 'Bet failed' }; }
  this.state.bets.push({ userId, slot, amount, cashedOut: false });
  this.persistBet(userId, amount, slot);
    this.emitUpdate();
    return { ok: true, balance } as any;
  }

  public async cashOut(userId: string, slot?: 'A'|'B') {
    if (this.state.phase !== 'running') return { ok: false, message: 'Cannot cash out now' };
    const bet = slot ? this.state.bets.find(b => b.userId === userId && b.slot === slot) : this.state.bets.find(b => b.userId === userId && !b.cashedOut);
    if (!bet) return { ok: false, message: 'No active bet' };
    if (bet.cashedOut) return { ok: false, message: 'Already cashed out' };
    bet.cashedOut = true;
    bet.cashoutMultiplier = this.state.multiplier;
    const payout = +(bet.amount * this.state.multiplier).toFixed(2);
    let balance: number | undefined = undefined;
    try {
      const tx: any = await addTransaction(userId, 'WIN', payout, { roundId: this.state.roundId, multiplier: this.state.multiplier, slot: bet.slot });
      balance = typeof tx?.balance === 'number' ? tx.balance : undefined;
    } catch (e: any) { return { ok: false, message: e.message || 'Cashout failed' }; }
  this.persistCashout(userId, bet.cashoutMultiplier!, bet.slot);
    this.emitUpdate();
    return { ok: true, payout, balance } as any;
  }

  // Persistence helpers
  private async persistRoundPartial() {
    try {
      await pool.query(`INSERT INTO crash_rounds (round_id, server_seed_hash, server_seed, nonce, waiting_ends_at, locked_ends_at) VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE locked_ends_at=VALUES(locked_ends_at)`, [
        this.state.roundId,
        this.state.fair.serverSeedHash,
        null, // hide server seed until after crash (optionally)
        this.state.fair.nonce,
        this.state.waitingEndsAt,
        this.state.lockedEndsAt
      ]);
    } catch {}
  }
  private async persistRoundStart() {
    try {
      await pool.query(`UPDATE crash_rounds SET server_seed=?, crash_point=?, started_at=? WHERE round_id=?`, [
        this.state.fair.serverSeed,
        this.state.fair.crashPoint,
        this.state.startTime,
        this.state.roundId
      ]);
    } catch {}
  }
  private async persistRoundCrash() {
    try { await pool.query(`UPDATE crash_rounds SET crashed_at=? WHERE round_id=?`, [this.state.crashTime, this.state.roundId]); } catch {}
  }
  private async pruneDbHistory() {
    try {
      // keep newest 50 by round_id
      await pool.query(`DELETE FROM crash_rounds WHERE crashed_at IS NOT NULL AND round_id NOT IN (SELECT round_id FROM (SELECT round_id FROM crash_rounds WHERE crashed_at IS NOT NULL ORDER BY round_id DESC LIMIT 50) x)`);
    } catch {}
  }
  private async persistBet(userId: string, amount: number, slot: 'A'|'B') {
    try {
      // Ensure schema has a 'slot' column; if not, this will silently ignore extra value in some MySQL configs.
      await pool.query(`INSERT INTO crash_bets (id, round_id, user_id, amount, slot, created_at) VALUES (UUID(),?,?,?,?, NOW())`, [this.state.roundId, userId, amount, slot]);
    } catch {}
  }
  private async persistCashout(userId: string, cashoutMultiplier: number, slot: 'A'|'B') {
    try { await pool.query(`UPDATE crash_bets SET cashed_out=1, cashout_multiplier=?, cashed_out_at=? WHERE round_id=? AND user_id=? AND slot=?`, [cashoutMultiplier, Date.now(), this.state.roundId, userId, slot]); } catch {}
  }
}

export const crashGameService = new CrashGameService();
