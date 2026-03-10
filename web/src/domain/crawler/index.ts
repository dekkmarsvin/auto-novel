import ky from 'ky';

import { Providers } from '@auto-novel/crawler';

const getProvider = (providerId: string) => {
  if (!window.Addon || !(providerId in Providers)) return undefined;
  const client = ky.create({ fetch: window.Addon.fetch });
  const providerInitFn = Providers[providerId as keyof typeof Providers];
  const provider = providerInitFn(client);
  return provider;
};

const updateWebNovel = async (providerId: string, novelId: string) => {
  const provider = getProvider(providerId);
  if (!provider) {
    console.log(`Provider ${providerId} not found or Addon not available`);
    return;
  }
  const metadata = await provider.getMetadata(novelId);
  console.log(metadata);
};

export const Crawler = {
  updateWebNovel,
};
