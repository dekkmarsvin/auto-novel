import { DEFAULT_CONFIG } from '@/config';
import { createApp } from '@/createApp';
import { CrawlerService } from '@/services/crawler';
import { createCrawlerRouter } from '@/services/routes';
import type { Server } from 'node:http';
import { once } from 'node:events';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { mountAdminRoutes } from '@/adminRoutes';
import { ProxyManager } from '@/services/proxy/manager';
import { ProxyStore } from '@/services/proxy/store';

const adminToken = 'test-admin-token-123';
const proxy = { protocol: 'http' as const, host: '127.0.0.1', port: 8899 };
const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

async function createTestServer(
  options: { adminToken?: string } = { adminToken },
) {
  const store = new ProxyStore(':memory:');
  const manager = new ProxyManager({ store });
  const initial = manager.add(proxy);
  const shutdown = vi.fn(async () => {});
  const crawler = new CrawlerService({ proxyManager: manager });
  const app = createApp(DEFAULT_CONFIG, {
    router: createCrawlerRouter(crawler),
  });
  mountAdminRoutes(app, options.adminToken, manager, shutdown);
  const server: Server = app.listen(0, '127.0.0.1');
  cleanups.push(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
      server.closeAllConnections();
    });
    store.close();
  });
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Unexpected address');
  return { url: `http://127.0.0.1:${address.port}`, store, initial, shutdown };
}

const requests = [
  ['GET', '/proxies'],
  ['POST', '/proxies'],
  ['DELETE', '/proxies/1'],
  ['PATCH', '/proxies/1'],
  ['PUT', '/proxies'],
  ['HEAD', '/proxies'],
  ['OPTIONS', '/proxies'],
  ['POST', '/shutdown'],
] as const;

describe('production admin routes', () => {
  test.each([undefined, 'wrong-admin-token-12', 'short'])(
    'rejects missing/wrong token %s before any side effect',
    async (token) => {
      const { url, store, initial, shutdown } = await createTestServer();
      for (const [method, route] of requests) {
        const response = await fetch(url + route, {
          method,
          headers: token ? { authorization: `Bearer ${token}` } : {},
          // Even malformed JSON must be rejected before the proxy body parser.
          ...(method === 'POST' && route === '/proxies'
            ? {
                body: '{',
                headers: {
                  'content-type': 'application/json',
                  ...(token ? { authorization: `Bearer ${token}` } : {}),
                },
              }
            : {}),
        });
        expect(response.status, `${method} ${route}`).toBe(401);
        await response.arrayBuffer();
        expect(store.listSync()).toEqual([initial]);
        expect(shutdown).not.toHaveBeenCalled();
      }
    },
  );

  test.each(['authorization', 'x-admin-token'])(
    'accepts %s for read, actual SQLite write/delete, and shutdown',
    async (header) => {
      const { url, store, initial, shutdown } = await createTestServer();
      const headers = {
        [header]:
          header === 'authorization' ? `Bearer ${adminToken}` : adminToken,
      };
      const listed = await fetch(url + '/proxies', { headers });
      expect(listed.status).toBe(200);
      expect(await listed.json()).toEqual([initial]);
      const added = await fetch(url + '/proxies', {
        method: 'POST',
        headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify({ ...proxy, port: 7890 }),
      });
      expect(added.status).toBe(201);
      const state = await added.json();
      expect(store.getByIdSync(state.id)?.config.port).toBe(7890);
      const removed = await fetch(`${url}/proxies/${state.id}`, {
        method: 'DELETE',
        headers,
      });
      expect(removed.status).toBe(204);
      expect(store.listSync()).toEqual([initial]);
      const stopped = await fetch(url + '/shutdown', {
        method: 'POST',
        headers,
      });
      expect(stopped.status).toBe(202);
      expect(await stopped.json()).toMatchObject({
        message: 'Server is shutting down...',
      });
      await vi.waitFor(() =>
        expect(shutdown).toHaveBeenCalledExactlyOnceWith('api-request', 0),
      );
    },
  );

  test('wrong X-Admin-Token and wrong Bearer with a valid fallback cannot mutate state', async () => {
    const { url, store, initial, shutdown } = await createTestServer();
    for (const headers of [
      { 'x-admin-token': 'wrong-admin-token-12' },
      {
        authorization: 'Bearer wrong-admin-token-12',
        'x-admin-token': adminToken,
      },
    ]) {
      for (const [method, route] of requests) {
        const response = await fetch(url + route, { method, headers });
        expect(response.status).toBe(401);
        await response.arrayBuffer();
        expect(store.listSync()).toEqual([initial]);
        expect(shutdown).not.toHaveBeenCalled();
      }
    }
  });

  test('without a configured token all admin endpoints remain unmounted even with credentials', async () => {
    const { url, store, initial, shutdown } = await createTestServer({});
    const health = await fetch(url + '/healthz');
    expect(health.status).toBe(200);
    expect(await health.json()).toMatchObject({ status: 'ok' });
    for (const headers of [
      {},
      { authorization: `Bearer ${adminToken}` },
      { 'x-admin-token': adminToken },
    ]) {
      for (const [method, route] of requests) {
        const response = await fetch(url + route, { method, headers });
        expect(response.status, `${method} ${route}`).toBe(404);
        await response.arrayBuffer();
        expect(store.listSync()).toEqual([initial]);
        expect(shutdown).not.toHaveBeenCalled();
      }
    }
  });
});
