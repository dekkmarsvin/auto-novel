import { expect, it, vi } from 'vitest';

const boundary = vi.hoisted(() => ({
  loaded: vi.fn(),
  stream: vi.fn(() => ({
    result: async () => ({
      stopReason: 'stop',
      content: [{ type: 'text', text: '翻譯' }],
      usage: { input: 1, output: 1 },
    }),
  })),
}));
vi.mock('@earendil-works/pi-ai/api/anthropic-messages.lazy', () => {
  boundary.loaded('anthropic');
  return { anthropicMessagesApi: () => ({ stream: boundary.stream }) };
});
vi.mock('@earendil-works/pi-ai/api/openai-completions.lazy', () => {
  boundary.loaded('completions');
  return { openAICompletionsApi: () => ({ stream: boundary.stream }) };
});
vi.mock('@earendil-works/pi-ai/api/openai-responses.lazy', () => {
  boundary.loaded('responses');
  return { openAIResponsesApi: () => ({ stream: boundary.stream }) };
});
vi.mock('@earendil-works/pi-ai/utils/transcript', () => {
  boundary.loaded('transcript');
  return { normalizeContext: (context: unknown) => context };
});

it('keeps the public reader import and pre-aborted calls free of AI runtime loading', async () => {
  // The reader imports the package entry, so checking only llm-client would miss
  // a static dependency reintroduced elsewhere in the translator export graph.
  await import('../src/index');
  expect(boundary.loaded).not.toHaveBeenCalled();
  const { createPiAiCompletion } = await import('../src/translator/llm-client');
  const request = {
    protocol: 'openai-completions' as const,
    endpoint: 'https://model.synthetic.test/v1',
    key: 'synthetic-key',
    model: 'fixture-model',
    messages: [{ role: 'user' as const, content: '原文' }],
    fetch: vi.fn(),
  };
  const abort = new AbortController();
  abort.abort(new DOMException('cancelled before import', 'AbortError'));
  await expect(
    createPiAiCompletion({ ...request, signal: abort.signal }),
  ).rejects.toMatchObject({ name: 'AbortError' });
  expect(boundary.loaded).not.toHaveBeenCalled();
  expect(boundary.stream).not.toHaveBeenCalled();
  expect(request.fetch).not.toHaveBeenCalled();

  await expect(createPiAiCompletion(request)).resolves.toMatchObject({
    text: '翻譯',
  });
  expect(boundary.loaded.mock.calls.flat()).toEqual(
    expect.arrayContaining([
      'anthropic',
      'completions',
      'responses',
      'transcript',
    ]),
  );
  expect(boundary.stream).toHaveBeenCalledOnce();
});
