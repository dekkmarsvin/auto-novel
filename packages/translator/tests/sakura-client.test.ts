import { afterEach, describe, expect, it, vi } from 'vitest';
import { HTTPError } from 'ky';

import { createOpenAiApi } from '../src/translator/sakura-client';
import { SakuraTranslator } from '../src/translator/sakura';
import { attemptTranslation } from '../src/pipeline/attempt';

describe('Sakura API 错误详情', () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each([
    [
      '嵌套错误',
      { error: { message: 'CUDA out of memory' } },
      'CUDA out of memory',
    ],
    ['顶层消息', { message: '模型加载失败' }, '模型加载失败'],
    ['detail', { detail: '上下文长度超限' }, '上下文长度超限'],
    ['未知 JSON', { reason: 'busy' }, '{"reason":"busy"}'],
    ['纯文本', 'upstream unavailable', 'upstream unavailable'],
    ['空响应', '', ''],
  ])('%s 同时用于模型探测和翻译请求', async (_name, body, detail) => {
    vi.stubGlobal('fetch', async () =>
      typeof body === 'string'
        ? new Response(body, { status: 500 })
        : Response.json(body, { status: 500 }),
    );
    const api = createOpenAiApi('https://example.test', 'no-key');
    for (const request of [
      () => api.listModels(),
      () => api.createChatCompletions({ model: '', messages: [] }),
    ]) {
      await expect(request()).rejects.toMatchObject({
        name: 'HTTPError',
        message: detail
          ? expect.stringContaining(`服务端错误：${detail}`)
          : expect.not.stringContaining('服务端错误'),
        response: expect.objectContaining({ status: 500 }),
      });
    }
  });

  it('长错误截断，避免撑满工作区日志', async () => {
    vi.stubGlobal(
      'fetch',
      async () => new Response('x'.repeat(3000), { status: 500 }),
    );
    await expect(
      createOpenAiApi('https://example.test', 'no-key').listModels(),
    ).rejects.toThrow(`服务端错误：${'x'.repeat(2000)}…`);
  });

  it('Sakura 日志及重试后的最终错误均保留服务端原因', async () => {
    const fetch = vi.fn(async () =>
      Response.json(
        { error: { message: 'CUDA out of memory' } },
        { status: 500 },
      ),
    );
    vi.stubGlobal('fetch', fetch);
    const log = vi.fn();
    const translator = await SakuraTranslator.create({
      endpoint: 'https://example.test',
      log,
    });
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('获取模型数据失败：HTTPError:'),
    );
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('服务端错误：CUDA out of memory'),
    );
    await expect(
      attemptTranslation(translator, { lines: ['原文'] }),
    ).rejects.toMatchObject({
      message: expect.stringMatching(/重试次数过多.*500.*CUDA out of memory/),
      cause: expect.objectContaining({ kind: 'request' }),
    });
    expect(fetch).toHaveBeenCalledTimes(4);
  });
});

describe('Sakura provider transport boundaries', () => {
  it.each([
    [
      JSON.stringify({
        error: { code: 'insufficient_quota', message: 'No credit' },
      }),
      'application/json',
      'No credit',
    ],
    [
      'Provider temporarily unavailable',
      'text/plain',
      'Provider temporarily unavailable',
    ],
  ])(
    'preserves consumed %s error data and HTTP context',
    async (body, contentType, detail) => {
      const fetch = vi.fn(
        async () =>
          new Response(body, {
            status: 429,
            headers: { 'content-type': contentType },
          }),
      );
      const api = createOpenAiApi('https://sakura.test', 'synthetic-key');
      const error = await api
        .createChatCompletions({ model: 'fixture', messages: [] }, { fetch })
        .catch((error: unknown) => error);

      expect(fetch).toHaveBeenCalledOnce();
      expect(error).toBeInstanceOf(HTTPError);
      expect((error as HTTPError).response.bodyUsed).toBe(true);
      expect((error as HTTPError).response.status).toBe(429);
      expect((error as HTTPError).data).toEqual(
        contentType === 'application/json' ? JSON.parse(body) : body,
      );
      expect(String(error)).toContain(detail);
    },
  );

  it('retains HTTP context when the provider sends no body', async () => {
    const api = createOpenAiApi('https://sakura.test', 'synthetic-key');
    await expect(
      api.listModels({
        fetch: async () => new Response(null, { status: 401 }),
      }),
    ).rejects.toMatchObject({
      name: 'HTTPError',
      response: { status: 401 },
      message: expect.stringContaining('401'),
    });
  });

  it('preserves transport failures', async () => {
    const api = createOpenAiApi('https://sakura.test', 'synthetic-key');
    const transportError = new TypeError('Network request failed');
    await expect(
      api.listModels({
        fetch: async () => {
          throw transportError;
        },
      }),
    ).rejects.toMatchObject({ name: 'NetworkError', cause: transportError });
  });

  it.each(['models', 'completion'] as const)(
    'preserves a pre-aborted %s reason without sending a request',
    async (kind) => {
      const api = createOpenAiApi('https://sakura.test', 'synthetic-key');
      const controller = new AbortController();
      const aborted = new DOMException('Cancelled', 'AbortError');
      controller.abort(aborted);
      const fetch = vi.fn();
      const options = { signal: controller.signal, fetch };
      await expect(
        kind === 'models'
          ? api.listModels(options)
          : api.createChatCompletions(
              { model: 'fixture', messages: [] },
              options,
            ),
      ).rejects.toBe(aborted);
      expect(fetch).not.toHaveBeenCalled();
    },
  );
});
