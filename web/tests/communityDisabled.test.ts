import { createPinia } from 'pinia';
import { PiniaColada } from '@pinia/colada';
import { createApp, createRenderer, h, nextTick, defineComponent } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import { commentsAvailable, community } from '../src/config';
import { lazyCommunityApi } from '../src/community';
import { renderToString } from 'vue/server-renderer';

const runtime = vi.hoisted(() => ({ createClient: vi.fn() }));
const mounts = vi.hoisted(() => ({ comment: vi.fn() }));
vi.mock('../src/components/comment/CommentList.vue', () => ({
  default: defineComponent({
    setup() {
      mounts.comment();
      return () => h('div');
    },
  }),
}));
vi.mock('../src/webKit', async () => {
  const { computed } = await import('vue');
  return {
    isLocalAuth: false,
    webKit: {
      createClient: runtime.createClient,
      whoami: computed(() => ({ user: undefined })),
    },
  };
});

describe('community deployment disabled', () => {
  it('overrides either user preference and never constructs an external client', async () => {
    const { CommentApi } = await import('../src/api/CommentApi');
    expect(community.enabled).toBe(false);
    expect(community.url).toBe('');
    expect(commentsAvailable(false)).toBe(false);
    expect(commentsAvailable(true)).toBe(false);
    expect(runtime.createClient).not.toHaveBeenCalled();
    expect(() => CommentApi.getComments).toThrow('未启用');
    expect(runtime.createClient).not.toHaveBeenCalled();
  });
  it('disables production query hooks even if a caller accidentally invokes them', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const app = createApp({});
    app.use(createPinia());
    app.use(PiniaColada);
    const { CommentRepo } = await import('../src/repos/useComment');
    // The API barrel also constructs the site's own novel client; no community URL.
    expect(
      runtime.createClient.mock.calls.every(([url]) => url === '/api/'),
    ).toBe(true);
    runtime.createClient.mockClear();
    app.runWithContext(() => {
      CommentRepo.useCommentList(1, 'web/syosetu/n1');
      CommentRepo.useReplyList(1, 'web/syosetu/n1', 1, true);
    });
    await nextTick();
    await nextTick();
    expect(fetch).not.toHaveBeenCalled();
    expect(runtime.createClient).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
  it('does not mount the actual comment view with either hide preference', async () => {
    const { default: View } = await import(
      '../src/components/CommunityComments.vue'
    );
    for (const hideComment of [false, true]) {
      const app = createApp({
        render: () =>
          h(View, { site: 'web/syosetu/n1', locked: false, hideComment }),
      });
      expect(await renderToString(app)).toBe('<!---->');
    }
    expect(mounts.comment).not.toHaveBeenCalled();
    expect(runtime.createClient).not.toHaveBeenCalled();
  });
  it('only constructs the configured service on an enabled first use', () => {
    const create = vi.fn(() => ({ read: vi.fn(() => 'result') }));
    const api = lazyCommunityApi(
      { enabled: true, url: 'https://owned.test' },
      create,
    );
    expect(create).not.toHaveBeenCalled();
    expect(api.read()).toBe('result');
    expect(api.read()).toBe('result');
    expect(create).toHaveBeenCalledOnce();
  });
});
