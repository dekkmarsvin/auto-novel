import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { storageBootstrapPlugin } from '../storageBootstrap';

function bootstrap(values: Record<string, string> = {}) {
  const data = new Map(Object.entries(values));
  const storage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
    removeItem: (key: string) => data.delete(key),
  };
  const handlers: Record<string, ((event: unknown) => void)[]> = {};
  const messages: string[] = [];
  let mounted = false;
  const document = {
    documentElement: { dataset: {} as Record<string, string> },
    getElementById: () =>
      mounted ? null : { appendChild: (text: string) => messages.push(text) },
    createTextNode: (text: string) => text,
  };
  const context = {
    localStorage: storage,
    window: {
      localStorage: storage,
      addEventListener: (event: string, handler: (event: unknown) => void) => {
        (handlers[event] ??= []).push(handler);
      },
    },
    document,
    matchMedia: () => ({ matches: false }),
  };
  const plugin = storageBootstrapPlugin();
  plugin.configResolved({ command: 'build', isProduction: true });
  for (const tag of plugin.transformIndexHtml.handler()) {
    runInNewContext(tag.children, context);
  }
  return {
    storage,
    document,
    messages,
    emit: (event: string, value: unknown) =>
      handlers[event].forEach((handler) => handler(value)),
    mount: () => {
      mounted = true;
    },
  };
}

describe('host storage and immutable SDK HTML bootstrap', () => {
  it('migrates legacy dark preference before the real SDK theme script runs', () => {
    const state = bootstrap({ setting: '{"theme":"dark"}' });
    expect(state.document.documentElement.dataset.theme).toBe('dark');
    expect(state.storage.getItem('web-kit:theme:v1')).toBe('"dark"');
    expect(state.storage.getItem('auto-novel:web-kit-migration:v1')).toBe('1');
  });

  it('forwards SDK lifecycle configuration so analytics only runs in production builds', () => {
    const plugin = storageBootstrapPlugin({ analytics: 'G-TEST123' });
    plugin.configResolved({ command: 'serve', isProduction: false });
    expect(plugin.transformIndexHtml.handler()).toHaveLength(3);
    plugin.configResolved({ command: 'build', isProduction: true });
    const tags = plugin.transformIndexHtml.handler();
    expect(tags).toHaveLength(4);
    expect(tags[3].children).toContain('G-TEST123');
    expect(tags[0].children).toContain('auto-novel:web-kit-migration:v1');
  });

  it('preserves the SDK startup reporter without writing errors after app mount', () => {
    const state = bootstrap();
    state.emit('error', {
      message: '<img onerror=alert(1)>',
      lineno: 1,
      colno: 2,
    });
    expect(state.messages).toEqual([
      expect.stringContaining('<img onerror=alert(1)>'),
    ]);
    state.mount();
    state.emit('unhandledrejection', { reason: new Error('late failure') });
    expect(state.messages).toHaveLength(1);
  });
});
