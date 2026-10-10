import { effectScope, nextTick, reactive } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const transport = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock('../src/api/auth/session', async () => {
  const { default: ky } = await import('ky');
  return {
    authApi: {
      createClient: (prefix: string) =>
        ky.create({
          prefix: `https://books.test${prefix}`,
          fetch: transport.fetch,
        }),
    },
  };
});

import {
  saveGlossaryDraft,
  useGlossaryDraft,
} from '../src/components/glossaryDraft';
import { GenericNovelId } from '../src/model/Common';

describe('novel glossary editor shared-theme binding', () => {
  let scope: ReturnType<typeof effectScope>;
  let requests: { url: string; method: string; body: unknown }[];

  beforeEach(() => {
    scope = effectScope();
    requests = [];
    transport.fetch.mockReset().mockImplementation(async (input, init) => {
      const request = new Request(input, init);
      requests.push({
        url: request.url,
        method: request.method,
        body: await request.json(),
      });
      return Response.json({});
    });
  });
  afterEach(() => scope.stop());

  for (const [label, gnid, endpoint] of [
    [
      'web',
      GenericNovelId.web('syosetu', 'n1'),
      '/api/novel/syosetu/n1/glossary',
    ],
    ['wenku', GenericNovelId.wenku('w1'), '/api/wenku/w1/glossary'],
  ] as const) {
    it(`${label}: term-only edits preserve the existing theme ID in the actual HTTP body`, async () => {
      const draft = scope.run(() =>
        useGlossaryDraft(() => ({
          glossary: { ウマ: '馬' },
          themeGlossaryId: 'shared-theme',
        })),
      )!;
      draft.glossary.value.ウマ = '賽馬';
      await saveGlossaryDraft(gnid, draft.snapshot(), vi.fn());
      expect(requests).toEqual([
        {
          url: `https://books.test${endpoint}`,
          method: 'PUT',
          body: { glossary: { ウマ: '賽馬' }, themeGlossaryId: 'shared-theme' },
        },
      ]);
    });

    it(`${label}: selecting another theme and explicitly selecting none are distinct edits`, async () => {
      const draft = scope.run(() =>
        useGlossaryDraft(() => ({
          glossary: {},
          themeGlossaryId: 'old-theme',
        })),
      )!;
      draft.themeGlossaryId.value = 'new-theme';
      expect(draft.isGlossaryChanged()).toBe(true);
      const selected = draft.snapshot();
      await saveGlossaryDraft(gnid, selected, vi.fn());
      draft.markSaved(selected);
      expect(draft.isGlossaryChanged()).toBe(false);
      draft.themeGlossaryId.value = '';
      expect(draft.isGlossaryChanged()).toBe(true);
      await saveGlossaryDraft(gnid, draft.snapshot(), vi.fn());
      expect(requests.map((r) => r.body)).toEqual([
        { glossary: {}, themeGlossaryId: 'new-theme' },
        { glossary: {} },
      ]);
    });
  }

  it('background refresh preserves unsaved terms and theme until explicit discard', async () => {
    const source = reactive({
      glossary: { 猫: '貓' },
      themeGlossaryId: 'first',
    });
    const draft = scope.run(() => useGlossaryDraft(() => source))!;
    draft.glossary.value.猫 = '小貓';
    draft.themeGlossaryId.value = 'unsaved';
    expect(draft.isGlossaryChanged()).toBe(true);
    source.glossary = { 猫: '貓咪' };
    source.themeGlossaryId = 'refreshed';
    await nextTick();
    expect(draft.snapshot()).toEqual({
      glossary: { 猫: '小貓' },
      themeGlossaryId: 'unsaved',
    });
    expect(draft.isGlossaryChanged()).toBe(true);
    draft.resetState();
    expect(draft.snapshot()).toEqual({
      glossary: { 猫: '貓咪' },
      themeGlossaryId: 'refreshed',
    });
    expect(draft.isGlossaryChanged()).toBe(false);
  });

  it('clean drafts follow background refresh', async () => {
    const source = reactive({ glossary: {}, themeGlossaryId: 'first' });
    const draft = scope.run(() => useGlossaryDraft(() => source))!;
    source.themeGlossaryId = 'refreshed';
    await nextTick();
    expect(draft.themeGlossaryId.value).toBe('refreshed');
    expect(draft.isGlossaryChanged()).toBe(false);
  });

  it('save completion marks only its snapshot and preserves input made while pending', async () => {
    const source = reactive({
      glossary: { 猫: '貓' },
      themeGlossaryId: 'first',
    });
    const draft = scope.run(() => useGlossaryDraft(() => source))!;
    let resolve!: () => void;
    const pending = new Promise<void>((done) => {
      resolve = done;
    });
    const persist = vi.fn(() => pending);
    const onSaved = vi.fn((value) => {
      source.glossary = value.glossary;
      source.themeGlossaryId = value.themeGlossaryId;
    });
    draft.glossary.value.猫 = '已送出';
    const saving = draft.submit(persist, onSaved);
    draft.glossary.value.猫 = '繼續輸入';
    draft.themeGlossaryId.value = 'later-theme';
    resolve();
    await saving;
    await nextTick();
    expect(onSaved).toHaveBeenCalledWith({
      glossary: { 猫: '已送出' },
      themeGlossaryId: 'first',
    });
    expect(draft.snapshot()).toEqual({
      glossary: { 猫: '繼續輸入' },
      themeGlossaryId: 'later-theme',
    });
    expect(draft.isGlossaryChanged()).toBe(true);
  });

  it('a pending save cannot apply to another novel or an unmounted editor', async () => {
    const source = reactive({
      glossary: { 猫: '貓' },
      themeGlossaryId: 'first',
    });
    const novel = reactive({ id: 'novel-a' });
    const draft = scope.run(() =>
      useGlossaryDraft(
        () => source,
        () => novel.id,
      ),
    )!;
    let resolve!: () => void;
    const pending = new Promise<void>((done) => {
      resolve = done;
    });
    const onSaved = vi.fn();
    const saving = draft.submit(() => pending, onSaved);
    novel.id = 'novel-b';
    source.glossary = { 猫: '新小說' };
    source.themeGlossaryId = 'second';
    await nextTick();
    resolve();
    await saving;
    expect(onSaved).not.toHaveBeenCalled();
    expect(draft.snapshot()).toEqual({
      glossary: { 猫: '新小說' },
      themeGlossaryId: 'second',
    });

    const disposedSaving = draft.submit(() => pending, onSaved);
    scope.stop();
    await disposedSaving;
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('local drafts update the volume without contacting web/wenku or persisting a theme ID', async () => {
    const updateLocal = vi.fn().mockResolvedValue(undefined);
    await saveGlossaryDraft(
      GenericNovelId.local('book.epub'),
      {
        glossary: { 猫: '貓' },
        themeGlossaryId: 'unused',
      },
      updateLocal,
    );
    expect(updateLocal).toHaveBeenCalledWith('book.epub', { 猫: '貓' });
    expect(requests).toEqual([]);
  });
});
