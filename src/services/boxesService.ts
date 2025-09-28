// (Removed initial simple stub implementation)
import { addTransaction } from './walletService.js';
import { getBalance } from './walletService.js';
import { pool } from '../config/db.js';
import crypto from 'crypto';

interface BoxesPlayRecord {
  id: string;
  userId: string;
  serverSeedHash: string;
  serverSeed: string;
  nonce: number;
  chosenIndex: number;
  winIndex2x: number;
  winIndex3x: number;
  winIndex5x: number;
  amount: number;
  multiplierAwarded?: number;
  createdAt: number;
}

let nonceCounter = 1;

function generateOutcome(serverSeed: string, nonce: number) {
  const h = crypto.createHash('sha256').update(`${serverSeed}:${nonce}`).digest();
  // Derive 3 distinct winning indices 0..9
  const indices: number[] = [];
  let i = 0;
  while (indices.length < 3 && i < h.length) {
    const candidate = h[i] % 10;
    if (!indices.includes(candidate)) indices.push(candidate);
    i++;
  }
  while (indices.length < 3) { // fallback
    const c = Math.floor(Math.random()*10);
    if (!indices.includes(c)) indices.push(c);
  }
  return { winIndex2x: indices[0], winIndex3x: indices[1], winIndex5x: indices[2] };
}

export class BoxesService {
  private history: BoxesPlayRecord[] = [];
  private HISTORY_LIMIT = 50;

  public async play(userId: string, amount: number, chosenIndex: number) {
    if (amount <= 0) return { ok:false, message:'Invalid amount' };
    if (chosenIndex < 0 || chosenIndex > 9) return { ok:false, message:'Invalid box' };
  let bal = 0;
  try { bal = await getBalance(userId); } catch { return { ok:false, message:'User not found' }; }
  if (bal < amount) return { ok:false, message:'Insufficient balance' };

    // Debit bet and capture updated balance
    let balanceAfter: number | undefined;
    try {
      const betTx = await addTransaction(userId, 'BET', amount, { game:'boxes' });
      balanceAfter = Number((betTx as any).balance);
    } catch (e:any) { return { ok:false, message:e.message || 'Bet failed' }; }

    const serverSeed = crypto.randomBytes(32).toString('hex');
    const serverSeedHash = crypto.createHash('sha256').update(serverSeed).digest('hex');
    const nonce = nonceCounter++;
    const outcome = generateOutcome(serverSeed, nonce);

    let multiplierAwarded: number | undefined;
    if (chosenIndex === outcome.winIndex2x) multiplierAwarded = 2;
    else if (chosenIndex === outcome.winIndex3x) multiplierAwarded = 3;
    else if (chosenIndex === outcome.winIndex5x) multiplierAwarded = 5;

    if (multiplierAwarded) {
      const payout = +(amount * multiplierAwarded).toFixed(2);
      try {
        const winTx = await addTransaction(userId, 'WIN', payout, { game:'boxes', multiplier: multiplierAwarded });
        balanceAfter = Number((winTx as any).balance);
      } catch {
        // If credit fails, fall back to fetching current balance to reflect the most accurate state
        try { balanceAfter = await getBalance(userId); } catch {}
      }
    }

    const rec: BoxesPlayRecord = {
      id: crypto.randomUUID(),
      userId,
      serverSeedHash,
      serverSeed,
      nonce,
      chosenIndex,
      amount,
      multiplierAwarded,
      createdAt: Date.now(),
      ...outcome
    };
    this.history.unshift(rec);
    if (this.history.length > this.HISTORY_LIMIT) this.history.length = this.HISTORY_LIMIT;
    this.persist(rec);

    // Ensure we always return some balance value
    if (typeof balanceAfter !== 'number' || !Number.isFinite(balanceAfter)) {
      try { balanceAfter = await getBalance(userId); } catch {}
    }
    return { ok:true, play: rec, balance: balanceAfter };
  }

  public getHistory(userId: string) {
    return this.history.filter(h => h.userId === userId).slice(0, 25).map(h => ({
      id: h.id,
      chosenIndex: h.chosenIndex,
      winIndex2x: h.winIndex2x,
      winIndex3x: h.winIndex3x,
      winIndex5x: h.winIndex5x,
      amount: h.amount,
      multiplierAwarded: h.multiplierAwarded,
      createdAt: h.createdAt,
      serverSeed: h.serverSeed,
      serverSeedHash: h.serverSeedHash,
      nonce: h.nonce
    }));
  }

  private async persist(r: BoxesPlayRecord) {
    try {
      await pool.query(`INSERT INTO boxes_plays (id,user_id,server_seed_hash,server_seed,nonce,chosen_index,win_index_2x,win_index_3x,win_index_5x,amount,multiplier_awarded,created_at,revealed_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?, NOW(), NOW())`, [
        r.id,r.userId,r.serverSeedHash,r.serverSeed,r.nonce,r.chosenIndex,r.winIndex2x,r.winIndex3x,r.winIndex5x,r.amount,r.multiplierAwarded ?? null
      ]);
    } catch {}
  }
}

export const boxesService = new BoxesService();
