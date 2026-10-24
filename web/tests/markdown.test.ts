import { afterEach, describe, expect, it, vi } from 'vitest';
import { markdownByMode } from '../src/components/markdown/markdown';

// Exercise the selected SDK parser without collecting its unrelated UI tree.
vi.mock('@novelia/web-kit', async () => {
  const { createMarkdown } =
    await import('../node_modules/@novelia/web-kit/src/ui/markdown/render');
  return { createMarkdown };
});

afterEach(() => vi.unstubAllGlobals());

describe('shared Markdown with installation novel links', () => {
  it('keeps NAILAIN and chapter links on the current installation', () => {
    vi.stubGlobal('window', {
      location: { host: 'books.local:5173', protocol: 'http:' },
    });
    const html = markdownByMode.article.render(
      '[章節](https://n.example/novel/nailain/42/chapter/1?lang=ja#text)',
    );
    expect(html).toContain(
      'href="http://books.local:5173/novel/nailain/42/chapter/1?lang=ja#text"',
    );
    expect(html).toContain('>章節</a>');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it('uses the fork fallback and rewrites auto-linked Wenku text', () => {
    const html = markdownByMode.comment.render('https://n.example/wenku/abc');
    expect(html).toContain('href="https://books.kotoban.top/wenku/abc"');
    expect(html).toContain('>https://books.kotoban.top/wenku/abc</a>');
  });

  it('preserves external source URLs and raw HTML remains disabled', () => {
    const html = markdownByMode.article.render(
      '[來源](https://ncode.syosetu.com/n1234/)\n<script>alert(1)</script>',
    );
    expect(html).toContain('href="https://ncode.syosetu.com/n1234/"');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('keeps rendering when an incomplete HTTP URL is entered', () => {
    const html = markdownByMode.article.render('[未完成](https://)\n後續內容');
    expect(html).toContain('後續內容');
    expect(html).toContain('未完成');
  });
});
