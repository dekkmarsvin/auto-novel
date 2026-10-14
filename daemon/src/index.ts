import { Command } from 'commander';
import { mapValues } from 'lodash-es';
import { createServer, Server } from 'node:http';

import { mountAdminRoutes } from '@/adminRoutes';
import { loadConfig } from '@/config';
import { createApp } from '@/createApp';
import manifest from '@/package.json';
import {
  CrawlerService,
  createCrawlerRouter,
  ProxyManager,
  ProxyStore,
} from '@/services';

async function main() {
  const program = new Command();

  program
    .name('auto-novel-server-crawler')
    .description('Auto Novel Server Crawler')
    .version(manifest.version)
    .option(
      '-c, --config <path>',
      'Path to config file',
      process.env.CONFIG_PATH || 'config.json',
    );

  const { config: configPath } = program.parse().opts<{ config: string }>();

  const config = await loadConfig(configPath);

  const proxyStore = new ProxyStore(config.proxyDbPath);
  const proxyManager = new ProxyManager({
    store: proxyStore,
    defaultProxies: config.defaultProxies,
  });
  const crawlerService = new CrawlerService({
    proxyManager,
    headers: mapValues(config.providerConfig, (c) => c?.headers ?? {}),
  });

  const router = createCrawlerRouter(crawlerService);
  const app = createApp(config, { router });

  const server = createServer(app);
  const shutdown = createGracefulShutdown(server, [() => proxyStore.close()]);

  mountAdminRoutes(app, config.adminToken, proxyManager, shutdown);

  server.listen(config.port, config.host, () => {
    console.log(`Server is running on http://${config.host}:${config.port}`);
  });

  try {
    await waitForServerClose(server);
  } catch (error) {
    console.error('Server terminated unexpectedly', error);
    await shutdown('server-error', 1);
    throw error;
  }

  await shutdown('server-closed', 0);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exitCode = 1;
});

function waitForServerClose(server: Server) {
  return new Promise<void>((resolve, reject) => {
    server.once('close', resolve);
    server.once('error', reject);
  });
}

function createGracefulShutdown(
  server: Server,
  closers: Array<() => Promise<void> | void> = [],
) {
  let isShuttingDown = false;
  let cleanupPromise: Promise<void> | null = null;

  const runClosers = () => {
    if (!cleanupPromise) {
      cleanupPromise = Promise.allSettled(
        closers.map((closer) => Promise.resolve(closer())),
      ).then(() => undefined);
    }
    return cleanupPromise;
  };

  server.once('close', () => void runClosers());

  const closeServer = () =>
    new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });

  const shutdown = async (reason: string, exitCode: number) => {
    if (isShuttingDown) {
      return runClosers();
    }
    isShuttingDown = true;
    if (exitCode !== 0) {
      process.exitCode = exitCode;
    }
    console.log(`Shutting down (${reason})`);
    try {
      await closeServer();
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code !== 'ERR_SERVER_NOT_RUNNING') {
        console.error('Failed to stop server gracefully', error);
      }
    }
    await runClosers();
  };

  const handleSignal = (signal: 'SIGINT' | 'SIGTERM') => {
    void shutdown(signal, 0);
  };

  process.on('SIGINT', handleSignal);
  process.on('SIGTERM', handleSignal);

  return shutdown;
}
