import type { Express } from 'express';

import { createAdminAuthMiddleware } from './adminAuth';
import type { ProxyManager } from './services/proxy/manager';
import { createProxyRouter } from './services/proxy/routers';

export function mountAdminRoutes(
  app: Express,
  adminToken: string | undefined,
  proxyManager: ProxyManager,
  shutdown: (reason: string, exitCode: number) => Promise<void>,
) {
  if (!adminToken) {
    console.warn(
      'Administrative endpoints (/proxies and /shutdown) are disabled. Set adminToken or CRAWLER_ADMIN_TOKEN to enable them.',
    );
    return;
  }

  const requireAdminAuth = createAdminAuthMiddleware(adminToken);
  app.use('/proxies', requireAdminAuth, createProxyRouter(proxyManager));
  app.post('/shutdown', requireAdminAuth, (_req, res) => {
    console.log('Shutdown requested via API');
    res.status(202).json({
      message: 'Server is shutting down...',
      uptime: process.uptime(),
      timestamp: Date.now(),
    });
    setImmediate(() => {
      shutdown('api-request', 0).catch((err) => {
        console.error('Error during API shutdown:', err);
        process.exit(1);
      });
    });
  });
}
