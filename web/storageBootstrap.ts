import { themeBootstrapPlugin } from '@novelia/web-kit/vite';
import { readFileSync } from 'node:fs';

const source = readFileSync(
  new URL('./src/storageMigration.js', import.meta.url),
  'utf8',
);
const storageMigrationScript = `${source.replace('export function', 'function')}\ntry { migrateLegacyStorage(window.localStorage); } catch {}`;

/** One injection keeps migration before the SDK's first-paint theme script. */
export function storageBootstrapPlugin() {
  const theme = themeBootstrapPlugin();
  return {
    name: 'auto-novel-storage-bootstrap',
    transformIndexHtml: {
      order: 'pre' as const,
      handler: () => [
        {
          tag: 'script',
          children: storageMigrationScript,
          injectTo: 'head-prepend' as const,
        },
        ...theme.transformIndexHtml.handler(),
      ],
    },
  };
}
