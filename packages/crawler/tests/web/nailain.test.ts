import { describe, expect, test } from 'vitest';

import { Nailain } from '@/web/nailain';
import { client } from './utils';

// 合言葉每月轮换，通过环境变量提供
const password = process.env.NAILAIN_PASSWORD;

describe.skipIf(!password)('nailain', () => {
  const provider = new Nailain(client, { password });

  test('metadata', async () => {
    // https://nailain.alwaysdata.net/posts/12612524
    const data = await provider.getMetadata('12612524');
    expect(data.title).toBe('腹黒の男の子に寝取られる話 その4');
    expect(data.keywords).toContain('寝取られ');
    expect(data.toc).toEqual([
      {
        title: '腹黒の男の子に寝取られる話 その4',
        chapterId: 'default',
        createAt: '2026-09-16T15:00:00.000Z',
      },
    ]);
  });

  test('chapter', async () => {
    const data = await provider.getChapter('12612524', 'default');
    expect(data.paragraphs[0]).toBe('翌日、カズヤから再び命令が届いた。');
  });

  test('wrong password', async () => {
    const bad = new Nailain(client, { password: 'wrong' });
    await expect(bad.getMetadata('12612524')).rejects.toThrow('合言葉错误');
  });
});
