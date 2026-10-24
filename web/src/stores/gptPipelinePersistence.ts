import { nextTick, onScopeDispose, ref, watch, type Ref } from 'vue';

import { LSKey } from './key';
import {
  browserWorkspaceLocks,
  withGptPipelineLock,
  type WorkspaceLocks,
} from './workspaceLock';

const storageError = '翻译器设置尚未保存，请重新加载后重试。';
const unsupportedError =
  '当前浏览器无法安全保存 GPT 设置，请更新浏览器，并通过 HTTPS 或本机地址访问。';
const conflictError = '其他标签页已更新翻译器设置，请重新操作。';

/** Only the transitioning GPT worker store needs coordinated browser writes. */
export function useGptPipelinePersistence<T extends object>(
  defaults: T,
  options: {
    storage?: Storage;
    locks?: WorkspaceLocks;
    initialize?: () => Promise<boolean>;
  } = {},
) {
  const browser = window;
  const locks = options.locks ?? browserWorkspaceLocks();
  const defaultRaw = JSON.stringify(defaults);
  const data = ref(JSON.parse(defaultRaw)) as Ref<T>;
  const ready = ref(false);
  const error = ref<string>();
  let storage: Storage | undefined;
  try {
    storage = options.storage ?? browser.localStorage;
  } catch {
    error.value = storageError;
  }
  let baseline: string | null | undefined;
  let generation = 0;
  let applying = false;
  let disposed = false;
  let lastSaved = true;
  let pending = Promise.resolve();

  function adopt(raw: string | null) {
    const value: unknown = JSON.parse(raw ?? defaultRaw);
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new Error('Invalid workspace');
    for (const [key, fallback] of Object.entries(defaults)) {
      if (
        Array.isArray(fallback) &&
        key in value &&
        !Array.isArray((value as Record<string, unknown>)[key])
      )
        throw new Error('Invalid workspace');
    }
    applying = true;
    try {
      data.value = { ...JSON.parse(defaultRaw), ...value };
      baseline = raw;
    } finally {
      applying = false;
    }
  }

  async function locked<R>(action: () => R) {
    if (!storage) throw new Error('Storage unavailable');
    return withGptPipelineLock(storage, locks, action);
  }

  const initialized = (async () => {
    try {
      if (options.initialize && !(await options.initialize())) {
        error.value = storageError;
        lastSaved = false;
      }
      await locked(() => adopt(storage!.getItem(LSKey.WorkspaceGptPipeline)));
    } catch {
      error.value = locks ? storageError : unsupportedError;
      lastSaved = false;
    } finally {
      ready.value = true;
    }
  })();

  watch(
    data,
    () => {
      if (applying || !ready.value || disposed) return;
      let desired: string;
      try {
        desired = JSON.stringify(data.value);
      } catch {
        error.value = storageError;
        lastSaved = false;
        return;
      }
      const observedGeneration = generation;
      pending = pending.then(async () => {
        try {
          await locked(() => {
            if (disposed) return;
            const current = storage!.getItem(LSKey.WorkspaceGptPipeline);
            if (generation !== observedGeneration || baseline !== current) {
              generation++;
              adopt(current);
              error.value = conflictError;
              lastSaved = false;
              return;
            }
            if (desired !== current) {
              storage!.setItem(LSKey.WorkspaceGptPipeline, desired);
              const readback = storage!.getItem(LSKey.WorkspaceGptPipeline);
              if (readback !== desired) {
                generation++;
                adopt(readback);
                error.value = conflictError;
                lastSaved = false;
                return;
              }
            }
            baseline = desired;
            error.value = undefined;
            lastSaved = true;
          });
        } catch {
          error.value = locks ? storageError : unsupportedError;
          lastSaved = false;
        }
      });
    },
    { deep: true, flush: 'sync' },
  );

  const onStorage = (event: StorageEvent) => {
    if (
      !ready.value ||
      event.storageArea !== storage ||
      (event.key !== null && event.key !== LSKey.WorkspaceGptPipeline)
    )
      return;
    void locked(() => {
      if (disposed) return;
      const current = storage!.getItem(LSKey.WorkspaceGptPipeline);
      if (current !== baseline) {
        generation++;
        adopt(current);
      }
    }).catch(() => {
      error.value = storageError;
      lastSaved = false;
    });
  };
  browser.addEventListener('storage', onStorage);
  onScopeDispose(() => {
    disposed = true;
    browser.removeEventListener('storage', onStorage);
  });

  const persisted = async () => {
    await initialized;
    await nextTick();
    let active;
    do {
      active = pending;
      await active;
    } while (active !== pending);
    return lastSaved;
  };

  return { ref: data, ready, error, initialized, persisted };
}
