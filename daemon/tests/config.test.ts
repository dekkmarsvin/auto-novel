import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Impit } from 'impit';
import { afterEach, expect, test, vi } from 'vitest';
import { ConfigSchema, loadConfig } from '@/config';

const dirs: string[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  for (const dir of dirs.splice(0))
    await fs.rm(dir, { recursive: true, force: true });
});

async function configFile(input: Record<string, unknown>) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'daemon-config-test-'));
  dirs.push(dir);
  const file = path.join(dir, 'config.json');
  await fs.writeFile(file, JSON.stringify(input));
  return file;
}

test('config token takes precedence over environment and is read again on reload', async () => {
  vi.stubEnv('CRAWLER_ADMIN_TOKEN', 'environment-token-123');
  const file = await configFile({ adminToken: 'config-admin-token-123' });
  const running = await loadConfig(file);
  expect(running.adminToken).toBe('config-admin-token-123');
  await fs.writeFile(
    file,
    JSON.stringify({ adminToken: 'rotated-config-token-123' }),
  );
  expect((await loadConfig(file)).adminToken).toBe('rotated-config-token-123');
});

test('environment is trimmed fallback and is never persisted to config', async () => {
  vi.stubEnv('CRAWLER_ADMIN_TOKEN', '  environment-token-123  ');
  const file = await configFile({});
  expect((await loadConfig(file)).adminToken).toBe('environment-token-123');
  expect(JSON.parse(await fs.readFile(file, 'utf8'))).not.toHaveProperty(
    'adminToken',
  );
  vi.stubEnv('CRAWLER_ADMIN_TOKEN', 'rotated-environment-token-123');
  expect((await loadConfig(file)).adminToken).toBe(
    'rotated-environment-token-123',
  );
});

test.each(['', '  '])(
  'empty environment %j leaves administration disabled',
  async (token) => {
    vi.stubEnv('CRAWLER_ADMIN_TOKEN', token);
    expect((await loadConfig(await configFile({}))).adminToken).toBeUndefined();
  },
);

test.each(['', 'short', null])(
  'invalid config token %j fails instead of falling back',
  async (token) => {
    vi.stubEnv('CRAWLER_ADMIN_TOKEN', 'environment-token-123');
    await expect(
      loadConfig(await configFile({ adminToken: token })),
    ).rejects.toThrow();
  },
);

test('short environment token fails validation', async () => {
  vi.stubEnv('CRAWLER_ADMIN_TOKEN', 'short');
  await expect(loadConfig(await configFile({}))).rejects.toThrow();
});

test('example keeps container listen address and valid proxy URL syntax', async () => {
  const example = JSON.parse(
    await fs.readFile(
      new URL('../config.example.json', import.meta.url),
      'utf8',
    ),
  );
  expect(example.host).toBe('::');
  expect(() => ConfigSchema.parse(example)).not.toThrow();
  expect(
    example.defaultProxies
      .slice(0, 2)
      .map((proxy: { host: string }) => proxy.host),
  ).toEqual(['127.0.0.1', '127.0.0.1']);
  for (const proxy of example.defaultProxies) {
    // Check the example's URL syntax without fetching or exercising CrawlerService.
    const proxyUrl = `${proxy.protocol}://${proxy.host}:${proxy.port}`;
    expect(() => new Impit({ proxyUrl })).not.toThrow();
  }
});
