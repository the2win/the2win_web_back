// Simple in-memory rate limit (per IP per route). Replace with robust store (Redis) in production.
const buckets = new Map();
const WINDOW_MS = 60_000; // 1 min
const MAX = 120;
export function rateLimit(req, res, next) {
    const key = `${req.ip}:${req.path}`;
    const now = Date.now();
    let bucket = buckets.get(key);
    if (!bucket || bucket.reset < now) {
        bucket = { count: 0, reset: now + WINDOW_MS };
        buckets.set(key, bucket);
    }
    bucket.count++;
    if (bucket.count > MAX) {
        return res.status(429).json({ message: 'Too many requests' });
    }
    res.setHeader('X-RateLimit-Remaining', (MAX - bucket.count).toString());
    next();
}
