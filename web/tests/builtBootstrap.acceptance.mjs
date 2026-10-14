import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

const html = readFileSync(
  new URL('../dist/index.html', import.meta.url),
  'utf8',
);
const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
  .map((match) => match[1])
  .filter(
    (source) =>
      source.includes('auto-novel:web-kit-migration:v1') ||
      source.includes('web-kit:theme:v1'),
  );
const jwt = `h.${Buffer.from(JSON.stringify({ uid: 7, sub: '讀者🐎', role: 'member', crat: 0, iat: Date.now() / 1000, exp: Date.now() / 1000 + 3600 })).toString('base64url')}.s`;
function browser(values) {
  const data = new Map(Object.entries(values));
  const storage = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
    removeItem: (key) => data.delete(key),
  };
  const document = {
    documentElement: { dataset: {}, style: { setProperty() {} } },
    querySelector: () => ({ setAttribute() {} }),
  };
  const context = {
    window: { localStorage: storage },
    localStorage: storage,
    document,
    Date,
    atob,
    Uint8Array,
    TextDecoder,
    matchMedia: () => ({ matches: false }),
  };
  return {
    storage,
    document,
    run: () => {
      for (const source of scripts) runInNewContext(source, context);
    },
  };
}
test('built HTML migrates Unicode uid session and applies legacy dark theme before paint', () => {
  assert.ok(scripts.length > 0);
  const state = browser({
    'auth-v2': JSON.stringify({ token: jwt }),
    setting: '{"theme":"dark"}',
  });
  state.run();
  assert.equal(
    JSON.parse(state.storage.getItem('web-kit:session:v1')).token,
    jwt,
  );
  assert.equal(state.document.documentElement.dataset.theme, 'dark');
});
test('built HTML gives existing new keys priority', () => {
  const state = browser({
    'auth-v2': JSON.stringify({ token: jwt }),
    setting: '{"theme":"dark"}',
    'web-kit:session:v1': 'invalid-new',
    'web-kit:theme:v1': '"light"',
  });
  state.run();
  assert.equal(state.storage.getItem('web-kit:session:v1'), 'invalid-new');
  assert.equal(state.document.documentElement.dataset.theme, 'light');
});
test('built HTML cannot restore stale legacy storage after logout', () => {
  const state = browser({ 'auth-v2': JSON.stringify({ token: jwt }) });
  state.run();
  state.storage.removeItem('web-kit:session:v1');
  state.storage.setItem('auth-v2', JSON.stringify({ token: jwt }));
  state.run();
  assert.equal(state.storage.getItem('web-kit:session:v1'), null);
});
