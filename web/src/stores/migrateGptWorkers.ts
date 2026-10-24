import type { GptPipelineWorker } from '@/model/Translator';
import { LSKey } from './key';
import {
  browserWorkspaceLocks,
  withGptPipelineLock,
  type WorkspaceLocks,
} from './workspaceLock';

export const gptWorkerMigrationKey = 'auto-novel:gpt-workers-migration:v1';

type BrowserStorage = Pick<Storage, 'getItem' | 'setItem'>;
type StoredWorkspace = Record<string, unknown> & { workers?: unknown[] };

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function readWorkspace(raw: string | null): StoredWorkspace {
  if (raw === null) return { workers: [], jobs: [], uncompletedJobs: [] };
  const value: unknown = JSON.parse(raw);
  if (
    !isObject(value) ||
    (value.workers !== undefined && !Array.isArray(value.workers))
  ) {
    throw new Error('Invalid workspace');
  }
  return value as StoredWorkspace;
}

function legacyWorker(value: unknown): GptPipelineWorker | undefined {
  if (isObject(value) && value.type === 'web') return;
  if (
    !isObject(value) ||
    typeof value.id !== 'string' ||
    !value.id.trim() ||
    typeof value.endpoint !== 'string' ||
    typeof value.key !== 'string' ||
    (value.model !== undefined && typeof value.model !== 'string')
  ) {
    throw new Error('Invalid legacy worker');
  }
  return {
    id: value.id,
    endpoint: value.endpoint || 'https://api.openai.com',
    model:
      value.model === undefined || value.model === 'gpt-3.5'
        ? 'gpt-3.5-turbo'
        : value.model,
    key: value.key,
    concurrency:
      typeof value.concurrency === 'number' &&
      Number.isInteger(value.concurrency) &&
      value.concurrency >= 1 &&
      value.concurrency <= 100
        ? value.concurrency
        : 1,
    profile: { id: 'openai' },
  };
}

/**
 * One release transition from the retired GPT page to Pipeline. Never mutate
 * the source, shared jobs/history or existing Pipeline settings. This helper
 * can retire once supported browser profiles have imported their old workers;
 * it is not a general workspace/storage migration layer.
 */
export async function migrateGptWorkers(
  storage: BrowserStorage,
  locks: WorkspaceLocks | undefined = browserWorkspaceLocks(),
): Promise<boolean> {
  try {
    return await withGptPipelineLock(storage, locks, importLockedWorkers);
  } catch {
    return false;
  }
}

function importLockedWorkers(storage: BrowserStorage): boolean {
  try {
    if (storage.getItem(gptWorkerMigrationKey) === '1') return true;
    const sourceRaw = storage.getItem(LSKey.WorkspaceGpt);
    const targetRaw = storage.getItem(LSKey.WorkspaceGptPipeline);
    const source = readWorkspace(sourceRaw);
    const target = readWorkspace(targetRaw);
    const workers = [...(target.workers ?? [])];
    if (
      workers.some(
        (worker) =>
          !isObject(worker) ||
          typeof worker.id !== 'string' ||
          typeof worker.endpoint !== 'string' ||
          typeof worker.model !== 'string' ||
          typeof worker.key !== 'string',
      )
    ) {
      return false;
    }
    const ids = new Set(workers.map((worker) => (worker as { id: string }).id));
    let added = 0;
    for (const value of source.workers ?? []) {
      const worker = legacyWorker(value);
      if (!worker) continue;
      if (
        workers.some(
          (existing) =>
            isObject(existing) &&
            existing.endpoint === worker.endpoint &&
            existing.model === worker.model &&
            existing.key === worker.key,
        )
      ) {
        continue;
      }
      const originalId = worker.id;
      let suffix = 1;
      while (ids.has(worker.id)) {
        worker.id = `${originalId}（旧版${suffix === 1 ? '' : ` ${suffix}`}）`;
        suffix++;
      }
      ids.add(worker.id);
      workers.push(worker);
      added++;
    }
    // Do not overwrite a workspace changed while these snapshots were read.
    if (
      storage.getItem(LSKey.WorkspaceGpt) !== sourceRaw ||
      storage.getItem(LSKey.WorkspaceGptPipeline) !== targetRaw
    ) {
      return false;
    }
    if (added > 0) {
      const imported = JSON.stringify({ ...target, workers });
      storage.setItem(LSKey.WorkspaceGptPipeline, imported);
      if (storage.getItem(LSKey.WorkspaceGptPipeline) !== imported)
        return false;
    }
    if (storage.getItem(LSKey.WorkspaceGpt) !== sourceRaw) return false;
    // A failed marker write can retry safely: connection equality deduplicates.
    storage.setItem(gptWorkerMigrationKey, '1');
    return storage.getItem(gptWorkerMigrationKey) === '1';
  } catch {
    // Parsing/quota/access failures leave originals and the retry marker intact.
    return false;
  }
}
