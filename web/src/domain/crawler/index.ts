import { isEqual } from 'lodash-es';

import type { WebNovelMetadata } from '@/api';
import { WebNovelApi, WebNovelCrawlerApi } from '@/api';
import type { WebNovelDto } from '@/model/WebNovel';
import { WebNovelRepo } from '@/repos';

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

const toCurrentMutationBody = (novel: WebNovelDto) => ({
  title: novel.titleJp,
  authors: novel.authors.map((author) => ({
    name: author.name,
    link: author.link ?? null,
  })),
  type: novel.type as WebNovelMetadata['type'],
  attentions: novel.attentions as WebNovelMetadata['attentions'],
  keywords: novel.keywords,
  points: novel.points ?? null,
  totalCharacters: novel.totalCharacters ?? 0,
  introduction: novel.introductionJp,
  toc: novel.toc.map((item) => ({
    title: item.titleJp,
    chapterId: item.chapterId ?? null,
    createAt:
      item.createAt != null
        ? new Date(item.createAt * 1000).toISOString()
        : null,
  })),
});

const updateWebNovel = async (providerId: string, novelId: string) => {
  const metadata = await WebNovelCrawlerApi.getMetadata(providerId, novelId);
  if (metadata == null) throw new Error('未找到小说');

  const body = toMutationBody(metadata);
  const current = await WebNovelApi.getNovel(providerId, novelId);
  if (isEqual(body, toCurrentMutationBody(current))) {
    throw new Error('没有必要更新');
  }

  await WebNovelRepo.updateNovel(providerId, novelId, body);
};

export const CrawlerService = {
  updateWebNovel,
};
