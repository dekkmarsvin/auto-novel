import { describe, expect, it } from 'vitest';

import { createOpenAiPromptBuilder } from '@/translator/openai-prompt';

describe('createOpenAiPromptBuilder', () => {
  it('parses numbered answers while preserving original blank lines', () => {
    const promptBuilder = createOpenAiPromptBuilder();

    expect(
      promptBuilder.parseAnswer(['#1:第一行', '#3：第三行'].join('\n'), [
        '一行目',
        '',
        '三行目',
      ]),
    ).toEqual(['第一行', '', '第三行']);
  });
});
