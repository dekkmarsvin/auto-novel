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
  expect(requests).toHaveLength(2);
  expect(requests[0].headers.get('Authorization')).toMatch(/^Bearer /);
  expect(requests[1].url).toContain('https://objects.example/');
  expect(requests[1].headers.has('Authorization')).toBe(false);
  expect(requests[1].credentials).toBe('omit');
  expect(requests[1].headers.get('If-None-Match')).toBe('*');
  expect(await requests[1].text()).toBe('image-fixture');
});
