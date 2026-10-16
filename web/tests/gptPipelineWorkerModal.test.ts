import * as Vue from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GptPipelineWorker } from '../src/model/Translator';

const boundary = vi.hoisted(() => ({
  store: vi.fn(),
  gptStore: vi.fn(),
  sakuraStore: vi.fn(),
  createTranslator: vi.fn(),
}));
vi.mock('../src/stores', () => ({
  useGptPipelineWorkspaceStore: boundary.store,
  useGptWorkspaceStore: boundary.gptStore,
  useSakuraWorkspaceStore: boundary.sakuraStore,
}));
vi.mock('@novelia/web-kit', () => ({
  Toast: {
    success: vi.fn(),
    warning: vi.fn(),
    promise: (value: Promise<unknown>) => value.catch(() => undefined),
  },
}));
vi.mock('naive-ui', () => ({}));
vi.mock('../src/domain/translate', () => ({
  Translator: { create: boundary.createTranslator },
}));
vi.mock('../src/components/GlossaryButton.vue', () => ({ default: {} }));
// Exercise the current registry without requiring a prebuilt translator dist.
vi.mock(
  '@auto-novel/translator',
  async () =>
    import('../../packages/translator/src/translator/profiles/openai'),
);

const renderer = Vue.createRenderer<object, object>({
  createElement: () => ({}),
  createText: () => ({}),
  createComment: () => ({}),
  setText() {},
  setElementText() {},
  patchProp() {},
  insert() {},
  remove() {},
  parentNode: () => null,
  nextSibling: () => null,
});
const cleanups: (() => void)[] = [];
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup());
  vi.clearAllMocks();
});

interface Controls {
  formValue: Vue.Ref<{
    endpoint: string;
    key: string;
    profileId: string;
    profileValues: Record<string, unknown>;
  }>;
  keyText: Vue.Ref<string>;
  modelText: Vue.Ref<string>;
  onProfileChange(id: string): void;
  onEndpointInput(value: string): void;
  submit(): Promise<void>;
}

async function modal(worker?: GptPipelineWorker) {
  const props = Vue.reactive({ show: true, worker });
  const records = Vue.ref({ workers: worker ? [structuredClone(worker)] : [] });
  boundary.store.mockReturnValue({
    ref: records,
    addWorker(value: GptPipelineWorker) {
      records.value.workers.push(value);
    },
  });
  const { default: Modal } =
    await import('../src/pages/workspace/components/GptPipelineWorkerModal.vue');
  let controls!: Controls;
  const form = Vue.defineComponent({
    setup(_props, { expose }) {
      // Only Naive UI's field validation boundary is stubbed; submit and store
      // writes execute the production SFC, including its reactive prop watcher.
      expose({
        validate: (done?: (errors?: unknown) => void) => {
          done?.();
          return Promise.resolve();
        },
      });
      return () => null;
    },
  });
  const app = renderer.createApp({
    setup() {
      controls = Modal.setup!(props, { expose() {}, emit() {} }) as Controls;
      return () => Vue.h(form, { ref: 'form' });
    },
  });
  app.provide(Vue.ssrContextKey, {});
  app.mount({});
  cleanups.push(() => app.unmount());
  await Vue.nextTick();
  return { controls, records, props };
}

const storedWorker = (
  overrides: Partial<GptPipelineWorker> = {},
): GptPipelineWorker => ({
  id: 'saved-worker',
  endpoint: 'https://custom-provider.test/openai/v1',
  model: 'saved-model',
  key: 'synthetic-existing-provider-key',
  concurrency: 2,
  ...overrides,
});

describe('GPT worker profile compatibility', () => {
  it('keeps an existing unprofiled worker on Chat Completions and its own endpoint when changing protocol', async () => {
    const worker = storedWorker();
    const { controls, records } = await modal(worker);
    expect(controls.formValue.value.profileId).toBe('openai');

    for (const id of ['anthropic', 'gemini', 'openai-responses']) {
      controls.onProfileChange(id);
      expect(controls.formValue.value.endpoint).toBe(worker.endpoint);
      expect(controls.formValue.value.key).toBe(worker.key);
    }
    // Editing the draft must not update the stored worker before submission.
    expect(records.value.workers[0]).toEqual(worker);
    await controls.submit();
    expect(records.value.workers[0]).toEqual({
      ...worker,
      profile: {
        id: 'openai-responses',
        values: { reasoning_effort: '__default__' },
      },
    });
  });

  it('preserves saved Gemini values and endpoint when reopening the form for another worker', async () => {
    const worker = storedWorker({
      profile: { id: 'gemini', values: { reasoning_effort: 'minimal' } },
    });
    const { controls, props, records } = await modal(worker);
    await controls.submit();
    expect(records.value.workers[0]).toEqual(worker);

    const other = storedWorker({
      id: 'other-worker',
      endpoint: 'https://second-provider.test/v1',
      key: 'synthetic-second-provider-key',
      profile: { id: 'gemini', values: { reasoning_effort: 'none' } },
    });
    records.value.workers.push(other);
    props.worker = other;
    await Vue.nextTick();
    expect(controls.formValue.value.profileValues.reasoning_effort).toBe(
      'none',
    );
    controls.onProfileChange('anthropic');
    await controls.submit();
    expect(records.value.workers[1]).toMatchObject({
      endpoint: other.endpoint,
      key: other.key,
      profile: { id: 'anthropic' },
    });
    expect(records.value.workers[0]).toEqual(worker);
  });

  it('auto-fills only a pristine new endpoint and never reroutes entered keys or a custom endpoint', async () => {
    const { controls, records } = await modal();
    expect(controls.formValue.value.profileId).toBe('deepseek');
    controls.onProfileChange('gemini');
    expect(controls.formValue.value.endpoint).toBe(
      'https://generativelanguage.googleapis.com/v1beta/openai',
    );
    controls.keyText.value = 'synthetic-new-provider-key';
    controls.onProfileChange('anthropic');
    expect(controls.formValue.value.endpoint).toBe(
      'https://generativelanguage.googleapis.com/v1beta/openai',
    );
    controls.onEndpointInput('https://chosen-provider.test/v1');
    controls.keyText.value = '';
    controls.onProfileChange('openai-responses');
    expect(controls.formValue.value.endpoint).toBe(
      'https://chosen-provider.test/v1',
    );
    controls.keyText.value = 'synthetic-chosen-provider-key';
    controls.modelText.value = 'chosen-model';
    await controls.submit();
    expect(records.value.workers).toEqual([
      {
        id: 'chosen-model',
        model: 'chosen-model',
        endpoint: 'https://chosen-provider.test/v1',
        key: 'synthetic-chosen-provider-key',
        concurrency: 1,
        profile: {
          id: 'openai-responses',
          values: { reasoning_effort: '__default__' },
        },
      },
    ]);
  });
});

describe('interactive translation completion', () => {
  it('records only successful translation results when Toast handles a rejection', async () => {
    boundary.gptStore.mockReturnValue({ ref: Vue.ref({ workers: [] }) });
    boundary.sakuraStore.mockReturnValue({
      ref: Vue.ref({
        workers: [{ id: 'offline', endpoint: 'https://sakura.test' }],
      }),
    });
    const translate = vi.fn().mockResolvedValueOnce(['译文']);
    boundary.createTranslator.mockResolvedValue({ translate });
    const { default: Interactive } =
      await import('../src/pages/workspace/Interactive.vue');
    let controls!: {
      textJp: Vue.Ref<string>;
      textZh: Vue.Ref<string>;
      savedTranslation: Vue.Ref<unknown[]>;
      translate(): Promise<void>;
    };
    const app = renderer.createApp({
      setup() {
        controls = Interactive.setup!({}, { expose() {} }) as typeof controls;
        return () => null;
      },
    });
    app.provide(Vue.ssrContextKey, {});
    app.mount({});
    cleanups.push(() => app.unmount());
    controls.textJp.value = '原文';
    await Vue.nextTick();
    await controls.translate();
    expect(controls.savedTranslation.value).toEqual([
      {
        id: 'sakura',
        workerId: 'offline',
        endpoint: 'https://sakura.test',
        jp: '原文',
        zh: '译文',
      },
    ]);

    translate.mockRejectedValueOnce(new Error('provider unavailable'));
    controls.textJp.value = '失败原文';
    await Vue.nextTick();
    await controls.translate();
    expect(controls.textZh.value).toBe('');
    expect(controls.savedTranslation.value).toHaveLength(1);
    expect(translate).toHaveBeenCalledTimes(2);
  });
});
