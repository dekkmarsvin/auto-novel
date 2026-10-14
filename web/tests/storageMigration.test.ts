import { describe, expect, it } from 'vitest';
import { migrateLegacyStorage } from '../src/storageMigration.js';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const now = 2_000_000_000_000;
const token = (claims: object = {}) =>
  `header.${Buffer.from(JSON.stringify({ uid: 1, sub: 'user', role: 'member', crat: 0, iat: now / 1000 - 1, exp: now / 1000 + 60, ...claims })).toString('base64url')}.signature`;
function storage(values: Record<string, string> = {}) {
  const entries = new Map(Object.entries(values));
  return {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => {
      entries.set(key, value);
    },
    removeItem: (key: string) => {
      entries.delete(key);
    },
  };
}

describe('one-time legacy storage migration', () => {
  it('moves a valid uid session and theme, removing legacy auth without changing other settings', () => {
    const old = token();
    const value = storage({
      'auth-v2': JSON.stringify({ token: old, adminMode: true }),
      setting: JSON.stringify({ theme: 'dark', hideCommmentWebNovel: false }),
    });
    migrateLegacyStorage(value, now);
    expect(JSON.parse(value.getItem('web-kit:session:v1')!)).toEqual({
      token: old,
      adminMode: false,
    });
    expect(value.getItem('web-kit:theme:v1')).toBe('"dark"');
    expect(value.getItem('auth-v2')).toBeNull();
    expect(JSON.parse(value.getItem('setting')!).hideCommmentWebNovel).toBe(
      false,
    );
  });
  it('does not overwrite even invalid new keys', () => {
    const value = storage({
      'auth-v2': JSON.stringify({ token: token() }),
      'web-kit:session:v1': 'invalid',
      'web-kit:theme:v1': 'invalid',
      setting: '{"theme":"dark"}',
    });
    migrateLegacyStorage(value, now);
    expect(value.getItem('web-kit:session:v1')).toBe('invalid');
    expect(value.getItem('web-kit:theme:v1')).toBe('invalid');
  });
  it.each([
    { uid: undefined },
    { uid: '1' },
    { uid: 0 },
    { exp: now / 1000 },
    { role: 'unknown' },
  ])('rejects incompatible or expired claims %j', (claims) => {
    const value = storage({
      'auth-v2': JSON.stringify({ token: token(claims) }),
    });
    migrateLegacyStorage(value, now);
    expect(value.getItem('web-kit:session:v1')).toBeNull();
  });
  it('never revives a legacy token written by an old tab after logout', () => {
    const value = storage({ 'auth-v2': JSON.stringify({ token: token() }) });
    migrateLegacyStorage(value, now);
    value.removeItem('web-kit:session:v1');
    value.setItem('auth-v2', JSON.stringify({ token: token() }));
    migrateLegacyStorage(value, now);
    expect(value.getItem('web-kit:session:v1')).toBeNull();
  });
  it('does not copy anything if the marker cannot persist', () => {
    const value = storage({ 'auth-v2': JSON.stringify({ token: token() }) });
    value.setItem = () => {
      throw new Error('blocked storage');
    };
    expect(() => migrateLegacyStorage(value, now)).not.toThrow();
    expect(value.getItem('web-kit:session:v1')).toBeNull();
  });
  it('runs the actual prepaint script independently of module helpers', () => {
    const value = storage({ setting: '{"theme":"dark"}' });
    const storageMigrationScript =
      readFileSync(
        new URL('../src/storageMigration.js', import.meta.url),
        'utf8',
      ).replace('export function', 'function') +
      '\nmigrateLegacyStorage(window.localStorage);';
    runInNewContext(storageMigrationScript, {
      window: { localStorage: value },
      Date,
      atob,
      Uint8Array,
      TextDecoder,
    });
    expect(value.getItem('web-kit:theme:v1')).toBe('"dark"');
  });
});
