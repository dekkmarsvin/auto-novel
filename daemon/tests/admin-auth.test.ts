import Express from 'express';
import { afterAll, describe, expect, test } from 'vitest';

import { createAdminAuthMiddleware } from '@/adminAuth';
import { createProxyRouter } from '@/services/proxy/routers';
import type { ProxyManager } from '@/services/proxy/manager';

const adminToken = 'test-admin-token-123';
const servers: Array<{ close: () => Promise<void> }> = [];

describe('admin authentication', () => {
  afterAll(async () => {
    await Promise.all(servers.map((server) => server.close()));
  });

  test('rejects unauthenticated proxy management requests', async () => {
    const url = await createProxyTestServer();

    const response = await fetch(`${url}/proxies`);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
  });

  test('allows proxy management requests with a bearer admin token', async () => {
    const url = await createProxyTestServer();

    const response = await fetch(`${url}/proxies`, {
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([
      {
        id: 1,
        config: {
          protocol: 'http',
          host: 'proxy.example',
          port: 8080,
          username: 'user',
          password: 'pass',
        },
        failCount: 0,
        successCount: 0,
        cooldownUntil: null,
        lastUsedAt: null,
      },
    ]);
  });
});

async function createProxyTestServer() {
  const app = Express();
  app.use(
    '/proxies',
    createAdminAuthMiddleware(adminToken),
    createProxyRouter(createStubProxyManager()),
  );

  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  servers.push({
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Unexpected server address');
  }
  return `http://127.0.0.1:${address.port}`;
}

function createStubProxyManager(): ProxyManager {
  return {
    list: () => [
      {
        id: 1,
        config: {
          protocol: 'http',
          host: 'proxy.example',
          port: 8080,
          username: 'user',
          password: 'pass',
        },
        failCount: 0,
        successCount: 0,
        cooldownUntil: null,
        lastUsedAt: null,
      },
    ],
    add: (config) => ({
      id: 2,
      config,
      failCount: 0,
      successCount: 0,
      cooldownUntil: null,
      lastUsedAt: null,
    }),
    remove: () => undefined,
  } as ProxyManager;
}
