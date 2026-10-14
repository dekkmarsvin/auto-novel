import {
  Alphapolis,
  Hameln,
  Kakuyomu,
  Novelup,
  Pixiv,
  Syosetu,
  type WebNovelProvider,
} from '@auto-novel/crawler';
import type { KyInstance } from 'ky';
import z from 'zod';

// The crawler package now exports provider classes rather than a registry.
// Keep the daemon's existing provider IDs and injected proxy client contract.
export const Providers = {
  alphapolis: (client: KyInstance) => new Alphapolis(client),
  hameln: (client: KyInstance) => new Hameln(client),
  kakuyomu: (client: KyInstance) => new Kakuyomu(client),
  novelup: (client: KyInstance) => new Novelup(client),
  pixiv: (client: KyInstance) => new Pixiv(client),
  syosetu: (client: KyInstance) => new Syosetu(client, { concurrency: 2 }),
} satisfies Record<string, (client: KyInstance) => WebNovelProvider>;

export const ProviderIdSchema = z.enum(
  Object.keys(Providers) as [
    keyof typeof Providers,
    ...Array<keyof typeof Providers>,
  ],
);
export type ProviderId = z.infer<typeof ProviderIdSchema>;
