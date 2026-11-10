import { Router } from 'express';

/** /api/health = process is up. /api/health/ready = process can reach the database. */
export function healthRouter(checkDatabase: () => Promise<void>): Router {
  const router = Router();
  router.get('/', (_req, res) => {
    res.json({ status: 'ok', uptimeSeconds: Math.round(process.uptime()) });
  });
  router.get('/ready', async (_req, res) => {
    try {
      await checkDatabase();
      res.json({ status: 'ready', database: 'up' });
    } catch {
      res.status(503).json({ status: 'unavailable', database: 'down' });
    }
  });
  return router;
}
