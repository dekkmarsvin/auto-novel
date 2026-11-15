import type { GptPipelineWorker } from '@/model/Translator';

export interface GptWorkerBaseline {
  id: string;
  contents: string;
}

// Storage events replace the live worker while an open dialog keeps its draft.
// Compare only that worker, including profile values, without key-order noise.
export function captureGptWorkerBaseline(
  worker: GptPipelineWorker | undefined,
): GptWorkerBaseline | undefined {
  if (!worker) return;
  return {
    id: worker.id,
    contents: JSON.stringify(worker, (_key, value) =>
      value && typeof value === 'object' && !Array.isArray(value)
        ? Object.fromEntries(
            Object.entries(value).sort(([left], [right]) =>
              left.localeCompare(right),
            ),
          )
        : value,
    ),
  };
}

export function matchesGptWorkerBaseline(
  baseline: GptWorkerBaseline,
  worker: GptPipelineWorker,
): boolean {
  return baseline.contents === captureGptWorkerBaseline(worker)?.contents;
}
