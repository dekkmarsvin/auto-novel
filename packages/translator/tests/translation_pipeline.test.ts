import { afterEach, describe, expect, it, vi } from 'vitest';

import { TranslationPipeline } from '../src/pipeline/translation_pipeline';
import { createLineSegmenter } from '../src/segment';
import type { SegmentCache, SegmentContext, Translator } from '../src/types';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const pipelines: TranslationPipeline[] = [];
function pipeline(mode: 'chapter' | 'segment', cache?: SegmentCache, hwm = 20) {
  const value = new TranslationPipeline(
    hwm,
    createLineSegmenter(undefined, 1),
    cache,
    mode,
  );
  pipelines.push(value);
  return value;
}
afterEach(() => {
  for (const value of pipelines.splice(0)) {
    value.clearLoops();
    value.queue.clear();
  }
});

describe('chapter and segment translation concurrency', () => {
  it('chapter mode runs its segments in order and supplies preceding translations', async () => {
    const value = pipeline('chapter');
    const first = deferred<string[]>();
    const calls: { lines: string[]; previous: string[][] }[] = [];
    const translator: Translator = {
      translate: vi.fn(async (lines, context) => {
        calls.push({
          lines,
          previous: structuredClone(context?.prevSegs ?? []),
        });
        return lines[0] === 'a'
          ? first.promise
          : lines.map((line) => `ZH:${line}`);
      }),
    };
    value.registerTranslator(translator, 3);
    const result = value.translate('a\nb\nc');
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    first.resolve(['ZH:a']);
    expect(await result).toBe('ZH:a\nZH:b\nZH:c');
    expect(calls).toEqual([
      { lines: ['a'], previous: [] },
      { lines: ['b'], previous: [['ZH:a']] },
      { lines: ['c'], previous: [['ZH:a'], ['ZH:b']] },
    ]);
  });

  it('different chapters run concurrently without mixing their history', async () => {
    const value = pipeline('chapter');
    const start = deferred<void>();
    const contexts: { line: string; previous: string[][] }[] = [];
    value.registerTranslator(
      {
        async translate(lines, context) {
          contexts.push({
            line: lines[0],
            previous: structuredClone(context?.prevSegs ?? []),
          });
          if (lines[0].endsWith('1')) await start.promise;
          return lines.map((line) => `ZH:${line}`);
        },
      },
      2,
    );
    const a = value.translate('a1\na2');
    const b = value.translate('b1\nb2');
    await vi.waitFor(() => expect(contexts).toHaveLength(2));
    start.resolve();
    expect(await Promise.all([a, b])).toEqual(['ZH:a1\nZH:a2', 'ZH:b1\nZH:b2']);
    expect(contexts.find((c) => c.line === 'a2')?.previous).toEqual([
      ['ZH:a1'],
    ]);
    expect(contexts.find((c) => c.line === 'b2')?.previous).toEqual([
      ['ZH:b1'],
    ]);
  });

  it('cached chapter segments contribute context to later segments', async () => {
    const cache: SegmentCache = {
      get: vi.fn(async (segment) =>
        segment.order === 0 ? ['cached:a'] : undefined,
      ),
      set: vi.fn(async () => {}),
    };
    const value = pipeline('chapter', cache);
    const translate = vi.fn(
      async (lines: string[], context?: SegmentContext) => {
        expect(context?.prevSegs).toEqual([['cached:a']]);
        return ['ZH:b'];
      },
    );
    value.registerTranslator({ translate }, 2);
    expect(await value.translate('a\nb')).toBe('cached:a\nZH:b');
    expect(translate).toHaveBeenCalledTimes(1);
  });

  it('a chapter error stops later segments, releases backpressure and allows retry', async () => {
    const value = pipeline('chapter', undefined, 1);
    const error = new Error('provider rejected segment');
    const translate = vi
      .fn()
      .mockRejectedValueOnce(error)
      .mockImplementation(async (lines: string[]) =>
        lines.map((line) => `ZH:${line}`),
      );
    const onSegError = vi.fn();
    value.registerTranslator({ translate }, 2);
    expect(
      await value.translate('a\nb\nc', {}, undefined, undefined, {
        onSegError,
      }),
    ).toBe('a\nb\nc');
    expect(translate).toHaveBeenCalledTimes(1);
    expect(onSegError.mock.calls.map(([order]) => order)).toEqual([0, 1, 2]);
    await value.waitUntilBelowHighWaterMark();
    expect(await value.translate('retry1\nretry2')).toBe(
      'ZH:retry1\nZH:retry2',
    );
  });

  it('cancelling a chapter prevents its next segment and permits another chapter', async () => {
    const value = pipeline('chapter', undefined, 1);
    const first = deferred<string[]>();
    const translate = vi
      .fn()
      .mockImplementationOnce(() => first.promise)
      .mockImplementation(async (lines: string[]) =>
        lines.map((line) => `ZH:${line}`),
      );
    value.registerTranslator({ translate }, 2);
    const controller = new AbortController();
    const result = value.translate('a\nb', {}, undefined, controller.signal);
    const rejected = expect(result).rejects.toMatchObject({
      name: 'AbortError',
    });
    await vi.waitFor(() => expect(translate).toHaveBeenCalledTimes(1));
    controller.abort();
    await rejected;
    first.resolve(['ZH:a']);
    await value.waitUntilBelowHighWaterMark();
    expect(translate).toHaveBeenCalledTimes(1);
    expect(await value.translate('retry')).toBe('ZH:retry');
  });

  it('stopping a chapter worker fails the rest and allows queue reuse by a new worker', async () => {
    const value = pipeline('chapter', undefined, 1);
    const translate = vi.fn(
      async (_lines, _context, signal: AbortSignal) =>
        new Promise<string[]>((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason), {
            once: true,
          });
        }),
    );
    const worker = value.registerTranslator({ translate }, 1);
    const result = value.translate('a\nb');
    await vi.waitFor(() => expect(translate).toHaveBeenCalledTimes(1));
    value.unregisterTranslator(worker);
    value.queue.clear();
    expect(await result).toBe('a\nb');
    value.registerTranslator(
      { translate: async (lines) => lines.map((line) => `retry:${line}`) },
      1,
    );
    expect(await value.translate('c\nd')).toBe('retry:c\nretry:d');
  });

  it('GPT segment mode remains concurrent and assembles results in source order', async () => {
    const value = pipeline('segment');
    const first = deferred<string[]>();
    const translate = vi.fn(
      async (lines: string[], context?: SegmentContext) => {
        expect(context?.prevSegs).toEqual([]);
        return lines[0] === 'a' ? first.promise : ['ZH:b'];
      },
    );
    value.registerTranslator({ translate }, 2);
    const result = value.translate('a\nb');
    await vi.waitFor(() => expect(translate).toHaveBeenCalledTimes(2));
    first.resolve(['ZH:a']);
    expect(await result).toBe('ZH:a\nZH:b');
  });
});
