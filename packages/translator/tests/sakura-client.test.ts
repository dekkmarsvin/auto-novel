import { HTTPError } from 'ky';
import { describe, expect, it, vi } from 'vitest';

import { createOpenAiApi } from '../src/translator/sakura-client';

describe('Sakura provider errors', () => {
  it.each([
    [
      JSON.stringify({
        error: { code: 'insufficient_quota', message: 'No credit' },
      }),
      'application/json',
    ],
    ['Provider temporarily unavailable', 'text/plain'],
  ])('preserves the consumed %s error body', async (body, contentType) => {
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
    expect(String(error)).toContain(body);
  });

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

  it('preserves transport and cancellation errors', async () => {
    const api = createOpenAiApi('https://sakura.test', 'synthetic-key');
    const transportError = new TypeError('Network request failed');
    await expect(
      api.listModels({
        fetch: async () => {
          throw transportError;
        },
      }),
    ).rejects.toMatchObject({ name: 'NetworkError', cause: transportError });

    const controller = new AbortController();
    const aborted = new DOMException('Cancelled', 'AbortError');
    controller.abort(aborted);
    const fetch = vi.fn();
    await expect(
      api.listModels({ signal: controller.signal, fetch }),
    ).rejects.toBe(aborted);
    expect(fetch).not.toHaveBeenCalled();
  });
});
