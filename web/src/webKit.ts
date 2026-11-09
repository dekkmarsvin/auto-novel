import { createWebKit } from '@novelia/web-kit';
import { authProductionUrl, siteUrls } from './config';
import { migrateLegacyStorage } from './storageMigration.js';

export const isLocalAuth = ['local', 'native'].includes(
  import.meta.env.VITE_API_MODE,
);
if (!isLocalAuth) {
  try {
    migrateLegacyStorage(window.localStorage);
  } catch {
    /* memory/refresh fallback */
  }
}

export const webKit = createWebKit({
  auth: {
    app: 'n',
    url: isLocalAuth
      ? '/__local-auth/'
      : import.meta.env.DEV
        ? '/auth-proxy/'
        : authProductionUrl,
  },
  brand: '小说',
  repository: {
    url: siteUrls.repository,
    buildTime: __BUILD_TIME__,
    commitSha: __COMMIT_SHA__,
  },
  strikes: { enabled: !isLocalAuth },
});
