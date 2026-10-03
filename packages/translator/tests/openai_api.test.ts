import { HTTPError } from 'ky';
import { describe, expect, it, vi } from 'vitest';

import { createOpenAiApi, OpenAiError } from '@/translator/openai-api';

const requestError = async (body: string | null, contentType: string) => {
  const fetch = vi.fn(
    async () =>
      new Response(body, {
        status: 429,
        statusText: 'Too Many Requests',
        headers: { 'content-type': contentType },
      }),
  );
  const api = createOpenAiApi('https://translator.test', 'test-key');
  const error = await api
    .createChatCompletions({ model: 'test-model', messages: [] }, { fetch })
    .catch((error: unknown) => error);

  expect(fetch).toHaveBeenCalledOnce();
  expect(error).toBeInstanceOf(HTTPError);
  return error as HTTPError;
};

describe('OpenAiError.handle', () => {
  it('preserves provider JSON errors after Ky consumes the response', async () => {
    const body = {
      error: {
        code: 'insufficient_quota',
        message: 'Translation credit exhausted',
      },
    };
    const error = await requestError(JSON.stringify(body), 'application/json');

    expect(error.response.bodyUsed).toBe(true);
    await expect(OpenAiError.handle(error)).rejects.toMatchObject({
      name: 'Error',
      status: 429,
      code: 'insufficient_quota',
      message: `429 insufficient_quota ${JSON.stringify(body)}`,
    });
  });

  it('preserves a plain text provider error', async () => {
    const error = await requestError(
      'Provider temporarily unavailable',
      'text/plain',
    );

    expect(error.response.bodyUsed).toBe(true);
    await expect(OpenAiError.handle(error)).rejects.toMatchObject({
      status: 429,
      code: undefined,
      message: '429 unknown_code Provider temporarily unavailable',
    });
  });

  it('keeps the HTTP error context when the provider sends no error details', async () => {
    const error = await requestError(null, 'application/json');

    await expect(OpenAiError.handle(error)).rejects.toMatchObject({
      status: 429,
      code: undefined,
      message: `429 unknown_code ${error.message}`,
    });
  });

  it('rethrows transport and cancellation errors unchanged', async () => {
    const transportError = new TypeError('Network request failed');
    const abortError = new DOMException('Cancelled', 'AbortError');

    await expect(OpenAiError.handle(transportError)).rejects.toBe(
      transportError,
    );
    await expect(OpenAiError.handle(abortError)).rejects.toBe(abortError);
  });
});
