import { throttle } from 'lodash-es';

import { useLocalStorage } from '@/util';
import { LSKey } from '../key';

export interface Draft {
  text: string;
  createdAt: Date;
}

interface DraftRegistry {
  [draftId: string]: { [createdAt: number]: string };
}

export const useDraftStore = defineStore(LSKey.Draft, () => {
  const registry = useLocalStorage<DraftRegistry>(LSKey.Draft, {});

  function getDraft(draftId: string) {
    if (!(draftId in registry.value)) return [];
    return Object.entries(registry.value[draftId]).map(
      ([key, value]) =>
        <Draft>{
          text: value,
          createdAt: new Date(Number(key)),
        },
    );
  }

  function addDraft(draftId: string, createdAt: number, text: string) {
    if (!(draftId in registry.value)) {
      registry.value[draftId] = {};
    }
    if (text === undefined) {
      delete registry.value[draftId][createdAt];
    } else {
      registry.value[draftId][createdAt] = text;
    }
  }

  function removeDraft(draftId: string) {
    delete registry.value[draftId];
  }

  const cleanupExpiredDrafts = () => {
    const expirationTime = 1000 * 60 * 60 * 24 * 3; // 3 day
    const now = Date.now();

    Object.keys(registry.value).forEach((draftId) => {
      const draft = registry.value[draftId];
      Object.keys(draft).forEach((createAt) => {
        if (now - Number(createAt) > expirationTime) {
          delete draft[Number(createAt)];
        }
      });
      if (Object.keys(draft).length === 0) {
        delete registry.value[draftId];
      }
    });
  };

  cleanupExpiredDrafts();

  return {
    getDraft,
    addDraft: throttle(addDraft, 5000),
    removeDraft,
  };
});
