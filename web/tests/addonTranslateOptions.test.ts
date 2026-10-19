import * as Vue from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GenericNovelId } from '../src/model/Common';

vi.mock('../src/stores', () => ({
  useWhoamiStore: () => Vue.reactive({ whoami: { hasNovelAccess: true } }),
}));
vi.mock('@novelia/web-kit', () => ({ XTooltip: { render: () => null } }));
vi.mock('@vicons/material', () => ({ InfoOutlined: {} }));
vi.mock('naive-ui', () => ({}));
vi.mock('../src/components/GlossaryButton.vue', () => ({ default: {} }));

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
  vi.unstubAllGlobals();
});

async function options(installed: boolean) {
  const browser = Object.assign(new EventTarget(), {
    Addon: installed ? {} : undefined,
  });
  vi.stubGlobal('window', browser);
  vi.stubGlobal('document', {
    documentElement: { hasAttribute: () => false },
  });
  const { default: Options } =
    await import('../src/pages/novel/components/TranslateOptions.vue');
  let exposed!: {
    getTranslateTaskParams(): { useBrowserCrawler: boolean };
  };
  let controls!: { updateBrowserCrawler(value: boolean): void };
  const app = renderer.createApp({
    setup() {
      // Execute the real SFC lifecycle and addon detection; UI rendering is
      // irrelevant to the emitted translation task options.
      controls = Options.setup!(
        { gnid: GenericNovelId.web('pixiv', '1') },
        { expose: (value: typeof exposed) => (exposed = value), emit() {} },
      ) as typeof controls;
      return () => null;
    },
  });
  app.provide(Vue.ssrContextKey, {});
  app.mount({});
  cleanups.push(() => app.unmount());
  return { browser, controls, exposed };
}

describe('addon detection in translation options', () => {
  it('uses an already installed addon in the actual task parameters', async () => {
    const { exposed } = await options(true);
    expect(exposed.getTranslateTaskParams().useBrowserCrawler).toBe(true);
  });

  it('detects late installation without overriding a manual choice', async () => {
    const { browser, controls, exposed } = await options(false);
    expect(exposed.getTranslateTaskParams().useBrowserCrawler).toBe(false);
    browser.Addon = {};
    browser.dispatchEvent(new Event('auto-novel-addon-ready'));
    expect(exposed.getTranslateTaskParams().useBrowserCrawler).toBe(true);
    controls.updateBrowserCrawler(false);
    browser.dispatchEvent(new Event('auto-novel-addon-ready'));
    expect(exposed.getTranslateTaskParams().useBrowserCrawler).toBe(false);
  });
});
