// DEPRECATED: Use walletRoutes.ts instead
import { Router } from 'express';
const router = Router();
router.use((_req, res) => res.status(410).json({ error: 'deprecated_route', message: 'Use /api/wallet via walletRoutes.ts' }));
export default router;
