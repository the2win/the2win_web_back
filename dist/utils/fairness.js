import crypto from 'crypto';
export function generateServerSeed() {
    return crypto.randomBytes(32).toString('hex');
}
export function hashServerSeed(seed) {
    return crypto.createHash('sha256').update(seed).digest('hex');
}
// Deterministic crash point using first 52 bits for a heavy-tail distribution
export function computeCrashPoint(serverSeed, nonce) {
    const h = crypto.createHash('sha256').update(`${serverSeed}:${nonce}`).digest('hex');
    const slice = h.substring(0, 13); // 52 bits
    const intVal = parseInt(slice, 16);
    const denom = 2 ** 52;
    const x = intVal / denom; // 0..1
    if (x === 0)
        return 1.0;
    const raw = 1 + (1 / (1 - x)) * 0.02; // heavy tail
    const capped = Math.min(raw, 250);
    return +capped.toFixed(2);
}
