// DEPRECATED: This legacy router is no longer used. Use `authRoutes.ts` instead.
// Intentionally respond with 410 Gone for all requests to prevent accidental usage.
import { Router } from 'express';
const router = Router();
router.use((_req, res) => res.status(410).json({ error: 'deprecated_route', message: 'Use /api/auth via authRoutes.ts' }));
export default router;
