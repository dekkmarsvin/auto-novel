import { afterEach, expect, it, vi } from 'vitest';
import { createLocalAdminClient } from '../src/runtimeClients';
import { createBannerApi } from '../src/api';

afterEach(() => vi.unstubAllGlobals());

it('confines the local development credential to the same-origin API', async () => {
  const requests: Request[] = [];
  const fetch = vi.fn(async (input: RequestInfo | URL) => {
    requests.push(new Request(input));
    return Response.json([]);
  });
  const client = createLocalAdminClient('http://localhost:5173').extend({
    fetch,
  });
  await client.get('admin/banner/');
  expect(requests[0].url).toBe('http://localhost:5173/api/v1/admin/banner/');
  expect(requests[0].headers.get('Authorization')).toMatch(/^Bearer /);

  await expect(
    client.get(new URL('https://auth.kotoban.top/api/v1/auth')),
  ).rejects.toThrow('本地凭据只能用于本站 API');
  await expect(
    client.get(new URL('http://localhost:5173/auth-proxy/')),
  ).rejects.toThrow('本地凭据只能用于本站 API');
  expect(fetch).toHaveBeenCalledTimes(1);
});

it('uploads the image directly without forwarding its bearer credential', async () => {
  const requests: Request[] = [];
  const uploads: {
    method: string;
    url: string;
    headers: Headers;
    withCredentials: boolean;
    body: unknown;
  }[] = [];
  // Keep the real SDK upload transport and intercept only the browser I/O.
  // This covers the switch from fetch to XHR, including its raw File body.
  vi.stubGlobal(
    'XMLHttpRequest',
    class {
      upload = { onprogress: null };
      onload: (() => void) | null = null;
      status = 204;
      statusText = 'No Content';
      withCredentials = true;
      headers = new Headers();
      method = '';
      url = '';
      open(method: string, url: string) {
        this.method = method;
        this.url = url;
      }
      setRequestHeader(name: string, value: string) {
        this.headers.set(name, value);
      }
      getAllResponseHeaders() {
        return '';
      }
      send(body: unknown) {
        uploads.push({
          method: this.method,
          url: this.url,
          headers: this.headers,
          withCredentials: this.withCredentials,
          body,
        });
        queueMicrotask(() => this.onload?.());
      }
    },
  );
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      requests.push(request);
      if (request.url === 'http://localhost:5173/api/v1/admin/banner/upload') {
        return Response.json({
          key: 'banners/example.png',
          uploadUrl:
            'https://objects.example/bucket/banners/example.png?signature=fixture',
          imageUrl: 'https://images.example/banners/example.png',
          headers: { 'Content-Type': 'image/png', 'If-None-Match': '*' },
        });
      }
      return new Response(null, { status: 200 });
    }),
  );

  const api = createBannerApi(createLocalAdminClient('http://localhost:5173'));
  const file = new File(['image-fixture'], 'example.png', {
    type: 'image/png',
  });
  await api.upload(file);
  expect(requests).toHaveLength(1);
  expect(requests[0].headers.get('Authorization')).toMatch(/^Bearer /);
  expect(uploads).toHaveLength(1);
  expect(uploads[0].url).toContain('https://objects.example/');
  expect(uploads[0].method).toBe('PUT');
  expect(uploads[0].headers.has('Authorization')).toBe(false);
  expect(uploads[0].withCredentials).toBe(false);
  expect(uploads[0].headers.get('If-None-Match')).toBe('*');
  expect(uploads[0].body).toBe(file);
});
