import * as Vue from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Toast } from '@novelia/web-kit';
import type { GptPipelineWorker } from '../src/model/Translator';
// Compile before a case installs its mutable worker store, so a cold import
// cannot outlive that case's timeout and resume against the next case's store.
import Modal from '../src/pages/workspace/components/GptPipelineWorkerModal.vue';

const boundary = vi.hoisted(() => ({
  store: vi.fn(),
}));
vi.mock('../src/stores', () => ({
  useGptPipelineWorkspaceStore: boundary.store,
}));
vi.mock('@novelia/web-kit', () => ({
  XDialog: {},
  XSelect: {},
  Toast: {
    success: vi.fn(),
    warning: vi.fn(),
    promise: (value: Promise<unknown>) => value.catch(() => undefined),
  },
}));
vi.mock('naive-ui', () => ({}));
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
  generatedWorkers: Vue.ComputedRef<
    { uid: string; id: string; model: string; key: string }[]
  >;
  workerNames: Record<string, string>;
  workerConcurrencies: Record<string, number>;
  currentProfile: Vue.ComputedRef<{
    fields: {
      key: string;
      options: readonly { label: string; value: string | number }[];
    }[];
  }>;
  profileFieldOptions(field: {
    key: string;
    options: readonly { label: string; value: string | number }[];
  }): { label: string; value: string | number }[];
  onProfileChange(id: string): void;
  onEndpointInput(value: string): void;
  submit(): Promise<void>;
}

async function modal(
  worker?: GptPipelineWorker,
  existing: GptPipelineWorker[] = [],
) {
  const props = Vue.reactive({ show: true, worker });
  const records = Vue.ref({
    workers: worker ? [structuredClone(worker)] : structuredClone(existing),
  });
  boundary.store.mockReturnValue({
    ref: records,
    addWorker(value: GptPipelineWorker) {
      records.value.workers.push(value);
    },
  });
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
    const field = controls.currentProfile.value.fields[0];
    expect(controls.profileFieldOptions(field)).toContainEqual({
      label: 'minimal',
      value: 'minimal',
    });
    expect(field.options.some((option) => option.value === 'minimal')).toBe(
      false,
    );
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
    expect(controls.profileFieldOptions(field)).toContainEqual({
      label: 'none',
      value: 'none',
    });
    expect(field.options.some((option) => option.value === 'none')).toBe(false);
    await controls.submit();
    expect(records.value.workers[1]).toEqual(other);
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

describe('batch GPT worker creation', () => {
  it('keeps edited names and concurrency attached to the same model and key when the preview changes', async () => {
    const existing = storedWorker({ id: 'model-a' });
    const { controls, records } = await modal(undefined, [existing]);
    controls.modelText.value = 'model-a\nmodel-b';
    controls.keyText.value = 'synthetic-one\nsynthetic-two';
    await Vue.nextTick();
    expect(controls.generatedWorkers.value.map((worker) => worker.id)).toEqual([
      'model-a (2)',
      'model-a (3)',
      'model-b',
      'model-b (2)',
    ]);
    const target = controls.generatedWorkers.value.find(
      (worker) => worker.model === 'model-a' && worker.key === 'synthetic-two',
    )!;
    controls.workerNames[target.uid] = ' Preferred model ';
    controls.workerConcurrencies[target.uid] = 7;

    controls.keyText.value = 'synthetic-two\nsynthetic-one';
    controls.modelText.value = 'model-a';
    await Vue.nextTick();
    await controls.submit();
    expect(records.value.workers).toEqual([
      existing,
      {
        id: 'Preferred model',
        model: 'model-a',
        key: 'synthetic-two',
        endpoint: 'https://api.deepseek.com',
        concurrency: 7,
        profile: {
          id: 'deepseek',
          values: { reasoning_effort: '__default__' },
        },
      },
      {
        id: 'model-a (3)',
        model: 'model-a',
        key: 'synthetic-one',
        endpoint: 'https://api.deepseek.com',
        concurrency: 1,
        profile: {
          id: 'deepseek',
          values: { reasoning_effort: '__default__' },
        },
      },
    ]);
  });

  it.each([
    [[' ', 'valid'], '翻译器名字不能为空'],
    [['duplicate', 'duplicate'], '翻译器名字「duplicate」重复'],
    [['saved-worker', 'valid'], '翻译器「saved-worker」已存在'],
  ] as const)(
    'rejects invalid batch names %j before any store writes',
    async (names, warning) => {
      const existing = storedWorker();
      const { controls, records } = await modal(undefined, [existing]);
      controls.modelText.value = 'model-a';
      controls.keyText.value = 'synthetic-one\nsynthetic-two';
      await Vue.nextTick();
      controls.generatedWorkers.value.forEach((worker, index) => {
        controls.workerNames[worker.uid] = names[index];
      });
      await controls.submit();
      expect(Toast.warning).toHaveBeenCalledWith(warning);
      expect(records.value.workers).toEqual([existing]);
    },
  );
});
