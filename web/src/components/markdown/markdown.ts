import { createMarkdown } from '@novelia/web-kit';

function createNovelMarkdown() {
  const markdown = createMarkdown();
  const renderLink = markdown.renderer.rules.link_open!;
  markdown.renderer.rules.link_open = (
    tokens,
    index,
    options,
    env,
    renderer,
  ) => {
    const token = tokens[index]!;
    const href = token.attrGet('href');
    if (typeof href === 'string' && /^https?:\/\//i.test(href)) {
      let url: URL;
      try {
        url = new URL(href);
      } catch {
        return renderLink(tokens, index, options, env, renderer);
      }
      if (
        /^\/(?:novel\/(?:default|alphapolis|hameln|kakuyomu|nailain|novelup|pixiv|syosetu)\/[^/]+|wenku\/[^/]+)(?:\/|$)/.test(
          url.pathname,
        )
      ) {
        url.host =
          typeof window === 'undefined'
            ? 'books.kotoban.top'
            : window.location.host || 'books.kotoban.top';
        url.protocol =
          typeof window === 'undefined'
            ? 'https:'
            : window.location.protocol || 'https:';
        token.attrSet('href', url.href);
        const text = tokens[index + 1];
        if (text?.type === 'text' && text.content === href)
          text.content = url.href;
      }
    }
    return renderLink(tokens, index, options, env, renderer);
  };
  return markdown;
}

export const markdown = createNovelMarkdown().disable([
  'blockquote',
  'code',
  'fence',
  'heading',
  'hr',
  'image',
  'lheading',
  'reference',
  'table',
]);
