import ky from 'ky';

import { Amazon } from '@auto-novel/crawler';

import { ensureCookie } from '@/api/third-party/util';

const getClient = async () => {
  const addon = window.Addon;
  if (!addon) return ky;

  const url = 'https://www.amazon.co.jp';
  const domain = '.amazon.co.jp';
  const keys = ['session-id', 'ubid-acbjp'];

  await ensureCookie(addon, url, domain, keys);

  return ky.create({
    fetch: addon.fetch,
  });
};

export const getAmazon = async () => new Amazon(await getClient());
