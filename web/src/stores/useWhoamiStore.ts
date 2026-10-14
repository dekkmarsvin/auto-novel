import { webKit, isLocalAuth } from '@/webKit';
import { localWhoami } from '@/runtimeClients';
import { LSKey } from './key';

export const useWhoamiStore = defineStore(LSKey.Auth, () => {
  const whoami = computed(() => {
    const session = isLocalAuth ? localWhoami : webKit.whoami.value;
    const atLeastMember = session.hasRoleAtLeast('member');
    const oldEnough = session.isAtLeastDaysOld(30);
    return {
      ...session,
      hasNsfwAccess: session.hasRoleAtLeast('restricted') && oldEnough,
      hasNovelAccess: atLeastMember && oldEnough,
    };
  });

  return { whoami };
});
