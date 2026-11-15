import type { ProxyOptions, UserConfig } from 'vite';
import { beforeEach, expect, it, vi } from 'vitest';
import viteConfig from '../vite.config';

const fixture = vi.hoisted(() => ({ env: {} as Record<string, string> }));
vi.mock('vite', async (original) => ({
  ...(await original<object>()),
  loadEnv: () => fixture.env,
}));
const configure = viteConfig as (environment: {
  command: 'serve' | 'build';
  mode: string;
}) => UserConfig;
const proxy = (config: UserConfig, key: string) =>
  config.server!.proxy![key] as ProxyOptions;

beforeEach(() => {
  fixture.env = {
    VITE_COMMIT_SHA: 'c'.repeat(40),
    VITE_BUILD_TIME: '2026-11-15T00:00:00Z',
  };
});

it.each([
  ['local', 'http://localhost:80', '/api/v1/admin/banner/'],
  ['native', 'http://localhost:8080', '/v1/admin/banner/'],
])(
  '%s Admin mode confines credentials and account navigation to local boundaries',
  (mode, target, path) => {
    fixture.env.VITE_API_MODE = mode;
    const config = configure({ command: 'serve', mode: 'development' });
    const api = proxy(config, '/api');
    expect(api.target).toBe(target);
    expect(
      api.rewrite?.('/api/v1/admin/banner/') ?? '/api/v1/admin/banner/',
    ).toBe(path);
    expect(api.agent).toBeUndefined();
    expect(config.define!.__AUTH_URL__).toBe(JSON.stringify('/__local-auth/'));
    expect(config.server!.proxy!['/auth-proxy']).toBeUndefined();
    expect(config.server!.proxy!['/api/v1/auth']).toBeUndefined();
    fixture.env.VITE_API_URL = 'https://books.kotoban.top';
    expect(() => configure({ command: 'serve', mode: 'development' })).toThrow(
      'loopback',
    );
  },
);

it('keeps remote Admin account deep links/assets on the auth service while retaining build identity', () => {
  const config = configure({ command: 'serve', mode: 'development' });
  expect(proxy(config, '^/api(?!/v1/auth)').target).toBe(
    'https://books.kotoban.top',
  );
  expect(proxy(config, '/api/v1/auth').target).toBe('https://auth.kotoban.top');
  expect(
    proxy(config, '/auth-proxy/assets').rewrite!(
      '/auth-proxy/assets/account.js',
    ),
  ).toBe('/assets/account.js');
  expect(config.define).toMatchObject({
    __AUTH_URL__: JSON.stringify('/auth-proxy/'),
    __COMMIT_SHA__: JSON.stringify(fixture.env.VITE_COMMIT_SHA),
    __BUILD_TIME__: JSON.stringify(fixture.env.VITE_BUILD_TIME),
  });
  const production = configure({ command: 'build', mode: 'production' });
  expect(production.define!.__AUTH_URL__).toBe(
    JSON.stringify('https://auth.kotoban.top/'),
  );
  expect(production.optimizeDeps!.exclude).toContain('@novelia/web-kit');
});
