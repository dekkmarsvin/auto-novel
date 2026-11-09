import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import type { ProxyOptions, UserConfig } from 'vite';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
    VITE_COMMIT_SHA: 'b'.repeat(40),
    VITE_BUILD_TIME: '2026-11-09T00:00:00Z',
    VITE_GIT_REPOSITORY: 'fixture-owner/auto-novel',
  };
});

describe('deployment Vite configuration', () => {
  it.each([
    ['local', 'http://localhost:80', '/api/novel'],
    ['native', 'http://localhost:8081', '/novel'],
  ])(
    '%s script keeps credentials on its loopback API and excludes remote auth',
    (mode, target, path) => {
      const { scripts } = JSON.parse(
        readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
      );
      fixture.env.VITE_API_MODE =
        scripts[`dev:${mode}`].match(/VITE_API_MODE=(\w+)/)[1];
      // The removed upstream switch must not override the host's three modes.
      fixture.env.VITE_LOCAL_API = 'false';
      const config = configure({ command: 'serve', mode: 'development' });
      const api = proxy(config, '/api');
      expect(api.target).toBe(target);
      expect(api.rewrite?.('/api/novel') ?? '/api/novel').toBe(path);
      expect(api.agent).toBeUndefined();
      expect(config.server!.proxy!['/api/v1/auth']).toBeUndefined();
      expect(config.server!.proxy!['/auth-proxy']).toBeUndefined();
      expect(config.server!.proxy!['/auth-proxy/assets']).toBeUndefined();
    },
  );

  it('remote development separates account API/assets from the novel proxy', () => {
    const config = configure({ command: 'serve', mode: 'development' });
    const proxies = config.server!.proxy!;
    const novel = proxy(config, '^/api(?!/v1/auth)');
    expect(proxies['/api']).toBeUndefined();
    expect(novel.target).toBe('https://books.kotoban.top');
    expect(new RegExp('^/api(?!/v1/auth)').test('/api/novel')).toBe(true);
    expect(new RegExp('^/api(?!/v1/auth)').test('/api/v1/auth/config')).toBe(
      false,
    );
    expect(proxy(config, '/api/v1/auth').target).toBe(
      'https://auth.kotoban.top',
    );
    expect(proxy(config, '/auth-proxy').target).toBe(
      'https://auth.kotoban.top',
    );
    expect(
      proxy(config, '/auth-proxy/assets').rewrite!(
        '/auth-proxy/assets/form.js',
      ),
    ).toBe('/assets/form.js');
    expect(proxy(config, '/files-extra').target).toBe(
      'https://books.kotoban.top',
    );
    expect(novel.agent).toBeDefined();
  });

  it('rewrites proxied account HTML assets while retaining response cookies', () => {
    const config = configure({ command: 'serve', mode: 'development' });
    const options = proxy(config, '/auth-proxy');
    const server = new EventEmitter();
    options.configure!(server as never, options);
    const upstream = Object.assign(new EventEmitter(), {
      statusCode: 200,
      statusMessage: 'OK',
      headers: {
        'content-type': 'text/html',
        'content-length': '99',
        'set-cookie': ['sid=mock; HttpOnly; Secure'],
      },
    });
    const headers = new Map();
    const response = {
      statusCode: 0,
      setHeader: (name: string, value: unknown) => headers.set(name, value),
      removeHeader: (name: string) => headers.delete(name),
      end: vi.fn(),
    };
    server.emit('proxyRes', upstream, {}, response);
    upstream.emit(
      'data',
      Buffer.from('<script src="/assets/form.js"></script>'),
    );
    upstream.emit('end');
    expect(response.end).toHaveBeenCalledWith(
      '<script src="/auth-proxy/assets/form.js"></script>',
    );
    expect(headers.get('set-cookie')).toEqual(['sid=mock; HttpOnly; Secure']);
    expect(headers.has('content-length')).toBe(false);
    expect(response.statusCode).toBe(200);
  });

  it('keeps injected source identity, the existing browser target and SDK singleton exclusion', () => {
    const config = configure({ command: 'build', mode: 'production' });
    expect(config.define).toMatchObject({
      __COMMIT_SHA__: JSON.stringify(fixture.env.VITE_COMMIT_SHA),
      __BUILD_TIME__: JSON.stringify(fixture.env.VITE_BUILD_TIME),
      __GIT_REPOSITORY__: JSON.stringify(fixture.env.VITE_GIT_REPOSITORY),
    });
    expect(config.build!.target).toEqual(['es2015']);
    expect(config.optimizeDeps!.exclude).toContain('@novelia/web-kit');
    expect(config.server!.proxy!['/auth-proxy']).toBeUndefined();
  });

  it('rejects unknown API modes before a credential-bearing proxy can start', () => {
    fixture.env.VITE_API_MODE = 'unrecognized';
    expect(() => configure({ command: 'serve', mode: 'development' })).toThrow(
      'VITE_API_MODE',
    );
  });
});
