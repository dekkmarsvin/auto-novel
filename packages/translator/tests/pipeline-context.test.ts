import { describe, expect, it, vi } from 'vitest';
import { TranslationPipeline } from '../src/pipeline/pipeline';
import type { TranslateRequest } from '../src/types';

describe('source context across independent inputs', () => {
  it('cache reuse keeps later context tied to its own original source', async () => {
    const get = vi.fn(async (key: string) =>
      key === 'a1' ? ['cached translation'] : undefined,
    );
    const set = vi.fn(async () => {});
    const pipeline = new TranslationPipeline({
      segmenter: {
        segment: (lines) =>
          lines.map((_, start) => ({ start, end: start + 1 })),
      },
      cache: { get, set },
    });
    const calls: Array<{ line: string; previous?: string }> = [];
    pipeline.registerTranslator(
      {
        trusted: true,
        getCacheKey: ({ lines }) => lines[0],
        translate: async ({ lines, context }: TranslateRequest) => {
          calls.push({ line: lines[0], previous: context?.previousSource });
          return lines.map((line) => `translated:${line}`);
        },
      },
      { concurrency: 3 },
    );
    try {
      const [a, b] = await Promise.all([
        pipeline.translate({ lines: ['a1', 'a2'] }),
        pipeline.translate({ lines: ['b1', 'b2'] }),
      ]);
      expect(a).toEqual({
        lines: ['cached translation', 'translated:a2'],
        failed: [],
      });
      expect(b).toEqual({
        lines: ['translated:b1', 'translated:b2'],
        failed: [],
      });
      expect(calls.find(({ line }) => line === 'a2')?.previous).toBe('a1');
      expect(calls.find(({ line }) => line === 'b2')?.previous).toBe('b1');
      expect(calls.map(({ line }) => line)).not.toContain('a1');
      expect(set).toHaveBeenCalledTimes(3);
    } finally {
      pipeline.dispose();
    }
  });
});
