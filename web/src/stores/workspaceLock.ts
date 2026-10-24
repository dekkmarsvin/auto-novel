export type WorkspaceStorage = Pick<Storage, 'getItem' | 'setItem'>;

export interface WorkspaceLocks {
  request<T>(name: string, action: () => T | Promise<T>): Promise<T>;
}

export const gptPipelineLockName = 'auto-novel:workspace-gpt-pipeline';

export function browserWorkspaceLocks(): WorkspaceLocks | undefined {
  if (typeof navigator === 'undefined' || !('locks' in navigator)) return;
  // eslint-disable-next-line compat/compat -- Feature-detected; callers refuse writes without Web Locks.
  return navigator.locks;
}

/** All current Pipeline settings writers share this origin-scoped lock. */
export function withGptPipelineLock<T>(
  storage: WorkspaceStorage,
  locks: WorkspaceLocks | undefined,
  action: (storage: WorkspaceStorage) => T | Promise<T>,
): Promise<T> {
  if (!locks) {
    return Promise.reject(
      new Error('当前浏览器无法安全保存 GPT 设置，请更新浏览器后重试。'),
    );
  }
  return locks.request(gptPipelineLockName, () => action(storage));
}
