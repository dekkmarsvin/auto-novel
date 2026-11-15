// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import * as Vue from 'vue';
import UForm from '@nuxt/ui/components/Form.vue';
import UFormField from '@nuxt/ui/components/FormField.vue';
import UInput from '@nuxt/ui/components/Input.vue';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { GptPipelineWorker } from '../src/model/Translator';
import Modal from '../src/pages/workspace/worker/GptWorkerDialog.vue';
import { useGptPipelinePersistence } from '../src/stores/gptPipelinePersistence';
import type { WorkspaceLocks } from '../src/stores/workspaceLock';

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

const storageKey = 'workspace-gpt-pipeline';
const worker = (id: string): GptPipelineWorker => ({
  id,
  model: 'fixture-model',
  endpoint: 'https://synthetic.test/v1',
  key: `synthetic-${id}`,
  concurrency: 1,
  profile: { id: 'deepseek', values: { reasoning_effort: 'high' } },
});
const initial = () => ({
  workers: [worker('one'), worker('two')],
  jobs: [{ task: 'retained-job' }],
  uncompletedJobs: [{ task: 'retained-history' }],
});

class MemoryStorage implements Storage {
  values = new Map([[storageKey, JSON.stringify(initial())]]);
  writes: string[] = [];
  rejectWrites = false;
  get length() {
    return this.values.size;
  }
  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    if (this.rejectWrites) throw new Error('quota');
    this.writes.push(value);
    this.values.set(key, value);
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
  clear() {
    this.values.clear();
  }
}

/** Two persistence contexts share a queued origin lock, not a no-op mock. */
class QueuedLocks implements WorkspaceLocks {
  requests = 0;
  private paused = false;
  private active = false;
  private queue: (() => Promise<void>)[] = [];
  request<T>(_name: string, action: () => T | Promise<T>): Promise<T> {
    this.requests++;
    return new Promise<T>((resolve, reject) => {
      this.queue.push(async () => {
        try {
          resolve(await action());
        } catch (error) {
          reject(error);
        }
      });
      this.run();
    });
  }
  hold() {
    this.paused = true;
    return () => {
      this.paused = false;
      this.run();
    };
  }
  private run() {
    if (this.paused || this.active || !this.queue.length) return;
    this.active = true;
    void this.queue.shift()!().finally(() => {
      this.active = false;
      this.run();
    });
  }
}

const cleanups: (() => void)[] = [];
afterEach(() => {
  cleanups
    .splice(0)
    .reverse()
    .forEach((cleanup) => cleanup());
  document.body.replaceChildren();
  vi.clearAllMocks();
});

function context(storage: MemoryStorage, locks: QueuedLocks) {
  const browser = Object.assign(new EventTarget(), { localStorage: storage });
  const realWindow = window;
  const scope = Vue.effectScope();
  // Each store captures its own browser event target. Restore the real DOM
  // window before mounting the real form, inputs and their event handlers.
  vi.stubGlobal('window', browser);
  const persistence = scope.run(() =>
    useGptPipelinePersistence(initial(), { storage, locks }),
  )!;
  vi.stubGlobal('window', realWindow);
  const store = {
    ref: persistence.ref,
    initialized: persistence.initialized,
    persistenceError: persistence.error,
    persisted: vi.fn(persistence.persisted),
  };
  cleanups.push(() => scope.stop());
  const receiveStorage = async () => {
    const event = new Event('storage');
    Object.defineProperties(event, {
      key: { value: storageKey },
      storageArea: { value: storage },
    });
    browser.dispatchEvent(event);
    await locks.request('test-barrier', () => {});
    await Vue.nextTick();
  };
  return { store, receiveStorage };
}

type Context = ReturnType<typeof context>;
function mountDialog(tab: Context, id = 'one') {
  boundary.store.mockReturnValue(tab.store);
  const show = Vue.ref(true);
  const closed = vi.fn();
  const source = readFileSync(
    'src/pages/workspace/worker/GptWorkerDialog.vue',
    'utf8',
  );
  const template = source.slice(
    source.indexOf('<template>') + 10,
    source.lastIndexOf('</template>'),
  );
  let controls!: {
    formValue: Vue.Ref<GptPipelineWorker>;
    saving: Vue.Ref<boolean>;
  };
  const ClientModal = {
    ...Modal,
    setup(props: unknown, setupContext: unknown) {
      controls = Modal.setup(props, setupContext) as typeof controls;
      return { ...controls };
    },
    render: Vue.compile(template.replaceAll(' as HTMLInputElement', '')),
  };
  const originalWorker = tab.store.ref.value.workers.find((w) => w.id === id)!;
  const app = Vue.createApp({
    render: () =>
      Vue.h(ClientModal, {
        show: show.value,
        worker:
          tab.store.ref.value.workers.find((w) => w.id === id) ??
          originalWorker,
        'onUpdate:show': closed,
      }),
  });
  const pass = Vue.defineComponent({
    setup:
      (_props, { slots }) =>
      () =>
        Vue.h('div', slots.default?.()),
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
  app.component('UFormField', UFormField);
  app.component('UInput', UInput);
  for (const name of ['USelect', 'UInputNumber', 'UTextarea', 'UAlert'])
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
  cleanups.push(() => app.unmount());
  const submit = () =>
    host
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  const draftKey = () =>
    [...host.querySelectorAll('input')].find(
      (input) => input.placeholder === 'API Key',
    )!.value;
  return { controls, submit, closed, show, draftKey };
}

async function setupTabs() {
  const storage = new MemoryStorage();
  const locks = new QueuedLocks();
  const a = context(storage, locks);
  const b = context(storage, locks);
  await Promise.all([a.store.initialized, b.store.initialized]);
  return { storage, locks, a, b };
}

describe('GPT dialog opening baseline with coordinated persistence', () => {
  it.each(['key', 'endpoint', 'profile'] as const)(
    'keeps the draft and refuses an adopted remote %s update',
    async (field) => {
      const { storage, a, b } = await setupTabs();
      const dialog = mountDialog(a);
      dialog.controls.formValue.value.key = 'synthetic-local-draft';
      const remote = b.store.ref.value.workers[0];
      if (field === 'profile') remote.profile!.values!.reasoning_effort = 'max';
      else if (field === 'endpoint') remote.endpoint = 'https://remote.test/v1';
      else remote.key = 'synthetic-remote';
      expect(await b.store.persisted()).toBe(true);
      await a.receiveStorage();
      const saved = storage.getItem(storageKey);
      dialog.submit();
      await vi.waitFor(() => expect(boundary.warning).toHaveBeenCalledOnce());
      expect(boundary.warning).toHaveBeenCalledWith(
        expect.stringContaining('草稿'),
      );
      expect(a.store.persisted).not.toHaveBeenCalled();
      expect(storage.getItem(storageKey)).toBe(saved);
      expect(dialog.draftKey()).toBe('synthetic-local-draft');
      expect(dialog.closed).not.toHaveBeenCalled();
      expect(boundary.success).not.toHaveBeenCalled();
    },
  );

  it('allows edits after another worker, ordering and jobs change', async () => {
    const { storage, a, b } = await setupTabs();
    const dialog = mountDialog(a);
    dialog.controls.formValue.value.key = 'synthetic-local-draft';
    b.store.ref.value.workers[1].key = 'synthetic-other-worker';
    b.store.ref.value.workers.reverse();
    b.store.ref.value.jobs.push({ task: 'new-job' });
    expect(await b.store.persisted()).toBe(true);
    await a.receiveStorage();
    dialog.submit();
    await vi.waitFor(() => expect(dialog.closed).toHaveBeenCalledWith(false));
    const saved = JSON.parse(storage.getItem(storageKey)!);
    expect(saved.workers.map((w: GptPipelineWorker) => [w.id, w.key])).toEqual([
      ['two', 'synthetic-other-worker'],
      ['one', 'synthetic-local-draft'],
    ]);
    expect(saved.jobs).toEqual([{ task: 'retained-job' }, { task: 'new-job' }]);
    expect(saved.uncompletedJobs).toEqual([{ task: 'retained-history' }]);
    expect(boundary.warning).not.toHaveBeenCalled();
  });

  it.each(['removed', 'renamed'] as const)(
    'refuses an original worker that was %s while the draft was open',
    async (change) => {
      const { storage, a, b } = await setupTabs();
      const dialog = mountDialog(a);
      dialog.controls.formValue.value.key = 'synthetic-local-draft';
      if (change === 'removed') b.store.ref.value.workers.shift();
      else b.store.ref.value.workers[0].id = 'remote-name';
      expect(await b.store.persisted()).toBe(true);
      await a.receiveStorage();
      const saved = storage.getItem(storageKey);
      dialog.submit();
      await vi.waitFor(() => expect(boundary.warning).toHaveBeenCalledOnce());
      expect(a.store.persisted).not.toHaveBeenCalled();
      expect(storage.getItem(storageKey)).toBe(saved);
      expect(dialog.draftKey()).toBe('synthetic-local-draft');
      expect(dialog.closed).not.toHaveBeenCalled();
    },
  );

  it('reacquires the current baseline only when the user closes and reopens', async () => {
    const { a, b } = await setupTabs();
    const dialog = mountDialog(a);
    dialog.controls.formValue.value.key = 'synthetic-old-draft';
    b.store.ref.value.workers[0].key = 'synthetic-remote';
    expect(await b.store.persisted()).toBe(true);
    await a.receiveStorage();
    expect(dialog.draftKey()).toBe('synthetic-old-draft');
    dialog.show.value = false;
    await Vue.nextTick();
    dialog.show.value = true;
    await Vue.nextTick();
    expect(dialog.draftKey()).toBe('synthetic-remote');
    dialog.controls.formValue.value.key = 'synthetic-new-draft';
    dialog.submit();
    await vi.waitFor(() => expect(dialog.closed).toHaveBeenCalledWith(false));
    expect(boundary.success).toHaveBeenCalledOnce();
  });

  it('permits retry of its own unpersisted object after quota recovery', async () => {
    const { storage, a } = await setupTabs();
    const dialog = mountDialog(a);
    dialog.controls.formValue.value.key = 'synthetic-local-draft';
    storage.rejectWrites = true;
    dialog.submit();
    await vi.waitFor(() => expect(a.store.persisted).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(dialog.controls.saving.value).toBe(false));
    expect(dialog.draftKey()).toBe('synthetic-local-draft');
    expect(boundary.success).not.toHaveBeenCalled();
    expect(dialog.closed).not.toHaveBeenCalled();
    expect(storage.writes).toHaveLength(0);
    storage.rejectWrites = false;
    dialog.submit();
    await vi.waitFor(() => expect(dialog.closed).toHaveBeenCalledWith(false));
    expect(JSON.parse(storage.getItem(storageKey)!).workers[0].key).toBe(
      'synthetic-local-draft',
    );
    expect(boundary.warning).not.toHaveBeenCalled();
  });

  it('has one confirmed winner when two real forms race before any storage event', async () => {
    const { storage, locks, a, b } = await setupTabs();
    const left = mountDialog(a);
    const right = mountDialog(b);
    left.controls.formValue.value.key = 'synthetic-left';
    right.controls.formValue.value.key = 'synthetic-right';
    const previousRequests = locks.requests;
    const release = locks.hold();
    left.submit();
    right.submit();
    await vi.waitFor(() => expect(locks.requests).toBe(previousRequests + 2));
    expect(storage.writes).toHaveLength(0);
    expect(boundary.success).not.toHaveBeenCalled();
    release();
    await vi.waitFor(() => {
      expect(left.controls.saving.value).toBe(false);
      expect(right.controls.saving.value).toBe(false);
    });
    expect(storage.writes).toHaveLength(1);
    expect(boundary.success).toHaveBeenCalledOnce();
    expect(left.closed.mock.calls.length + right.closed.mock.calls.length).toBe(
      1,
    );
    const winner = JSON.parse(storage.getItem(storageKey)!).workers[0].key;
    expect(['synthetic-left', 'synthetic-right']).toContain(winner);
    const loser = winner === 'synthetic-left' ? right : left;
    const loserStore = winner === 'synthetic-left' ? b.store : a.store;
    expect(loser.draftKey()).toBe(
      winner === 'synthetic-left' ? 'synthetic-right' : 'synthetic-left',
    );
    expect(loserStore.persistenceError.value).toContain('其他标签页');
    loser.submit();
    await vi.waitFor(() => expect(boundary.warning).toHaveBeenCalledOnce());
    expect(storage.writes).toHaveLength(1);
    expect(boundary.success).toHaveBeenCalledOnce();
    expect(loser.closed).not.toHaveBeenCalled();
  });
});
