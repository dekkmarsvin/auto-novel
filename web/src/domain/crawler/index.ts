import ky from 'ky';

import { WebNovelRepo } from '@/repos';
import type { WebNovelMetadata } from '@auto-novel/crawler';
import { WebNovelCrawler } from '@auto-novel/crawler';

const checkAddon = () => {
  return window.Addon !== undefined;
};

const getCrawler = () => {
  if (!window.Addon) return undefined;
  const client = ky.create({ fetch: window.Addon.fetch });
  return new WebNovelCrawler(client);
};

const toMutationBody = (metadata: WebNovelMetadata) => ({
  title: metadata.title,
  authors: metadata.authors.map((author) => ({
    name: author.name,
    link: author.link ?? null,
  })),
  type: metadata.type,
  attentions: metadata.attentions,
  keywords: metadata.keywords,
  points: metadata.points ?? null,
  totalCharacters: metadata.totalCharacters,
  introduction: metadata.introduction,
  toc: metadata.toc.map((item) => ({
    title: item.title,
    chapterId: item.chapterId ?? null,
    createAt: item.createAt ?? null,
  })),
});

const updateWebNovel = async (providerId: string, novelId: string) => {
  const crawler = getCrawler();
  if (!crawler) throw new Error('未检测到浏览器扩展');

  const metadata = await crawler.getMetadata(providerId, novelId);
  if (metadata == null) throw new Error('未找到小说');

  const body = toMutationBody(metadata);
  await WebNovelRepo.updateNovel(providerId, novelId, body);
};

export const CrawlerService = {
  checkAddon,
  updateWebNovel,
};
