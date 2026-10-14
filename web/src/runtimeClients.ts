import ky from 'ky';
import type { WebKit, Whoami } from '@novelia/web-kit';
import { shallowRef } from 'vue';

const devToken =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiLmnKzlnLDnlKjmiLciLCJyb2xlIjoiYWRtaW4iLCJjcmF0IjowLCJpYXQiOjB9.U6CwIExYZE7ls8jNeMPCkV8r2h6lOj6F7b3wJ_Ja5iY';

export function createNovelClient(
  local: boolean,
  kit: Pick<WebKit, 'createClient'>,
  origin: string,
) {
  if (!local) return kit.createClient('/api/', { timeout: 60_000 });
  return ky.create({
    prefix: new URL('/api/', origin).href,
    timeout: 60_000,
    hooks: {
      beforeRequest: [
        ({ request }) => {
          const url = new URL(request.url);
          if (url.origin !== origin || !url.pathname.startsWith('/api/')) {
            throw new Error('本地凭据只能用于本站 API');
          }
          request.headers.set('Authorization', `Bearer ${devToken}`);
        },
      ],
    },
  });
}

/** Local API authorization is independent of the kit's anonymous auth session. */
const localAdminMode = shallowRef(false);
export const toggleLocalManageMode = () => {
  localAdminMode.value = !localAdminMode.value;
};
export const localWhoami: Whoami = {
  get user() {
    return {
      id: 1,
      username: '本地用户',
      role: 'admin' as const,
      createdAt: 0,
      adminMode: localAdminMode.value,
    };
  },
  isSignedIn: true,
  isAdmin: true,
  get asAdmin() {
    return localAdminMode.value;
  },
  roleLabel: '管理员',
  hasRoleAtLeast: () => true,
  isAtLeastDaysOld: () => true,
};
