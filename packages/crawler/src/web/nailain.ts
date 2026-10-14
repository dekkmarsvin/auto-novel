import type { KyInstance } from 'ky';

import {
  type Page,
  type WebNovelChapter,
  type WebNovelListItem,
  type WebNovelMetadata,
  type WebNovelProvider,
  WebNovelAttention,
  WebNovelType,
  emptyPage,
} from './types';
import { CrawlerAuthError, CrawlerHttpError } from '@/errors';
import { parseJapanDateString } from './utils';

const BASE_URL = 'https://nailain.alwaysdata.net';

type NailainPost = {
  id: string;
  title: string;
  date: string; // yyyyMMdd
  characters: number;
  category: string;
  tags: string[];
  body: string;
};

// 站点以每月轮换的合言葉保护，登录后得到按月失效的 na_session cookie。
// 浏览器环境下 cookie 由浏览器保存；Node 环境下手动保存 set-cookie。
export class Nailain implements WebNovelProvider {
  readonly id = 'nailain';
  readonly version = '1.0.0';

  client: KyInstance;
  password: string | undefined;
  private cookie: string | undefined;

  constructor(client: KyInstance, options: { password?: string } = {}) {
    this.client = client;
    this.password = options.password;
  }

  async getRank(
    _options: Record<string, string>,
  ): Promise<Page<WebNovelListItem>> {
    return emptyPage();
  }

  async getMetadata(novelId: string): Promise<WebNovelMetadata> {
    const post = await this.getPost(novelId);
    return {
      title: post.title,
      authors: [{ name: 'NAILAIN', link: 'https://nailain.fanbox.cc/' }],
      type: WebNovelType.ShortStory,
      attentions: [WebNovelAttention.R18],
      keywords: [post.category, ...post.tags],
      points: null,
      totalCharacters: post.characters,
      introduction: post.body.slice(0, 200).trim(),
      toc: [
        {
          title: post.title,
          chapterId: 'default',
          createAt:
            parseJapanDateString('yyyyMMdd', post.date)?.toISOString() ?? null,
        },
      ],
    };
  }

  async getChapter(
    novelId: string,
    _chapterId: string,
  ): Promise<WebNovelChapter> {
    const post = await this.getPost(novelId);
    return { paragraphs: post.body.split('\n') };
  }

  private async getPost(novelId: string): Promise<NailainPost> {
    const url = `${BASE_URL}/api/posts/${encodeURIComponent(novelId)}`;
    let resp = await this.get(url);
    if (resp.status === 401) {
      await this.login();
      resp = await this.get(url);
    }
    if (resp.status === 401) {
      throw new CrawlerAuthError(
        '登录 NAILAIN ARCHIVE 失败，请先在浏览器打开源站输入本月合言葉',
      );
    }
    if (!resp.ok) {
      throw new CrawlerHttpError(
        `获取页面失败：${resp.status} ${resp.statusText} (${url})`,
        resp.status,
        url,
      );
    }
    return resp.json<NailainPost>();
  }

  private get(url: string) {
    return this.client.get(url, {
      throwHttpErrors: false,
      retry: 0,
      headers: this.cookie ? { cookie: this.cookie } : {},
    });
  }

  private async login() {
    if (!this.password) {
      throw new CrawlerAuthError(
        'NAILAIN ARCHIVE 需要登录，请先在浏览器打开源站输入本月合言葉',
      );
    }
    const resp = await this.client.post(`${BASE_URL}/login`, {
      throwHttpErrors: false,
      retry: 0,
      redirect: 'manual',
      body: new URLSearchParams({ password: this.password, next: '/' }),
    });
    // 成功时返回 303（浏览器中 manual 重定向表现为 opaqueredirect / status 0），失败为 401
    if (resp.status === 401) {
      throw new CrawlerAuthError('NAILAIN ARCHIVE 合言葉错误，可能已到月更换');
    }
    if (resp.status !== 303 && resp.status !== 0 && !resp.ok) {
      throw new CrawlerAuthError('NAILAIN ARCHIVE 登录失败');
    }
    const setCookie = resp.headers.get('set-cookie');
    const session = setCookie && /na_session=[^;]+/.exec(setCookie)?.[0];
    if (session) this.cookie = session;
  }
}
