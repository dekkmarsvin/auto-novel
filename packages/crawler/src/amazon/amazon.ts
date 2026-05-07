import type { KyInstance, Options } from 'ky';

const AMAZON_JP_URL = 'https://www.amazon.co.jp';

export class Amazon {
  constructor(private readonly client: KyInstance) {}

  private async getHtml(url: string, options?: Options) {
    const response = await this.client.get(url, {
      prefixUrl: AMAZON_JP_URL,
      redirect: 'manual',
      credentials: 'include',
      retry: 0,
      ...options,
    });

    if (response.status === 404) {
      throw Error('小说不存在，请删除cookie并使用日本IP重试');
    } else if (response.status === 0) {
      throw Error('触发年龄限制，请按说明使用插件');
    } else if (!response.ok) {
      throw Error(`未知错误，${response.status}`);
    }

    const html = await response.text();
    const parser = new DOMParser();
    return parser.parseFromString(html, 'text/html');
  }

  getProduct(asin: string) {
    return this.getHtml(`dp/${asin}`);
  }

  getSerial(asin: string, total: string) {
    return this.getHtml('kindle-dbs/productPage/ajax/seriesAsinList', {
      searchParams: {
        asin,
        pageNumber: 1,
        pageSize: total,
      },
    });
  }

  search(query: string) {
    return this.getHtml('s', {
      searchParams: {
        k: query,
        i: 'stripbooks',
      },
    });
  }
}
