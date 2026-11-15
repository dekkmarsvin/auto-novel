// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import * as Vue from 'vue';
import UForm from '@nuxt/ui/components/Form.vue';
import { afterEach, expect, it, vi } from 'vitest';
import Modal from '../src/pages/workspace/worker/GptWorkerDialog.vue';

const boundary = vi.hoisted(() => ({
  store: vi.fn(),
  success: vi.fn(),
  warning: vi.fn(),
}));
vi.mock('../src/stores', () => ({
  useGptPipelineWorkspaceStore: boundary.store,
}));
vi.mock('@novelia/web-kit', () => ({
  Toast: { success: boundary.success, warning: boundary.warning },
}));
vi.mock(
  '@auto-novel/translator',
  async () => import('../../packages/translator/src/translator/llm-profiles'),
);
let app: Vue.App | undefined;
afterEach(() => {
  app?.unmount();
  app = undefined;
  document.body.replaceChildren();
  vi.clearAllMocks();
});

it('routes a real native form submit through initialization and confirmed persistence', async () => {
  let initialize!: () => void;
  let confirmSave!: (value: boolean) => void;
  const initialized = new Promise<void>((resolve) => {
    initialize = resolve;
  });
  const persisted = vi.fn(
    () =>
      new Promise<boolean>((resolve) => {
        confirmSave = resolve;
      }),
  );
  const worker = {
    id: 'saved',
    model: 'model',
    endpoint: 'https://synthetic.test/v1',
    key: 'synthetic-key',
    concurrency: 1,
  };
  const records = Vue.ref({ workers: [{ ...worker }] });
  boundary.store.mockReturnValue({
    ref: records,
    initialized,
    persisted,
    persistenceError: Vue.ref(),
  });
  const source = readFileSync(
    'src/pages/workspace/worker/GptWorkerDialog.vue',
    'utf8',
  );
  const template = source.slice(
    source.indexOf('<template>') + 10,
    source.lastIndexOf('</template>'),
  );
  let controls!: {
    formValue: Vue.Ref<{ key: string }>;
    saving: Vue.Ref<boolean>;
  };
  const ClientModal = {
    ...Modal,
    setup(props: unknown, context: unknown) {
      controls = Modal.setup(props, context) as typeof controls;
      return { ...controls };
    },
    // Runtime template compilation erases only TS DOM casts; handlers stay real.
    render: Vue.compile(template.replaceAll(' as HTMLInputElement', '')),
  };
  const emit = vi.fn();
  app = Vue.createApp({
    render: () =>
      Vue.h(ClientModal, { show: true, worker, 'onUpdate:show': emit }),
  });
  app.component(
    'UModal',
    Vue.defineComponent({
      setup:
        (_props, { slots }) =>
        () =>
          Vue.h('div', [slots.body?.(), slots.footer?.()]),
    }),
  );
  app.component('UForm', UForm);
  const pass = Vue.defineComponent({
    setup:
      (_props, { slots }) =>
      () =>
        Vue.h('div', slots.default?.()),
  });
  for (const name of [
    'UFormField',
    'USelect',
    'UInput',
    'UInputNumber',
    'UTextarea',
    'UAlert',
  ])
    app.component(name, pass);
  app.component(
    'ActionButton',
    Vue.defineComponent({
      props: ['action'],
      setup:
        (props, { slots }) =>
        () =>
          Vue.h(
            'button',
            { type: 'button', onClick: () => props.action() },
            slots.default?.(),
          ),
    }),
  );
  const host = document.createElement('div');
  document.body.append(host);
  app.mount(host);
  controls.formValue.value.key = 'synthetic-edited-key';
  host
    .querySelector('form')!
    .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await Vue.nextTick();
  expect(records.value.workers[0]).toEqual(worker);
  expect(persisted).not.toHaveBeenCalled();
  initialize();
  await vi.waitFor(() => expect(persisted).toHaveBeenCalledOnce());
  expect(records.value.workers[0].key).toBe('synthetic-edited-key');
  expect(boundary.success).not.toHaveBeenCalled();
  expect(emit).not.toHaveBeenCalled();
  // A footer click while the native form's save is pending uses the same lock.
  host.querySelector('button')!.click();
  await Vue.nextTick();
  expect(persisted).toHaveBeenCalledOnce();
  confirmSave(false);
  await vi.waitFor(() => expect(controls.saving.value).toBe(false));
  expect(boundary.success).not.toHaveBeenCalled();
  expect(emit).not.toHaveBeenCalled();
});
