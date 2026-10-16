import { createWebKit } from '@novelia/web-kit';
import { createLocalAdminClient } from './runtimeClients';

export const isLocalAuth = ['local', 'native'].includes(
  import.meta.env.VITE_API_MODE,
);

export const webKit = createWebKit({
  auth: { app: 'n', url: __AUTH_URL__ },
  brand: '小说管理',
  strikes: { enabled: false },
  repository: {
    url: 'https://github.com/dekkmarsvin/auto-novel',
    buildTime: __BUILD_TIME__,
    commitSha: __COMMIT_SHA__,
  },
});

export function createAdminClient() {
  return isLocalAuth
    ? createLocalAdminClient(window.location.origin)
    : webKit.createClient(new URL('/api/v1/', window.location.origin).href);
}
