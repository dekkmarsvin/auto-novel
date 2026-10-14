import ky from 'ky';
import { expect, test } from 'vitest';

import { Providers } from '@/services/providers';

test.each(Object.entries(Providers))(
  'constructs %s with its declared provider ID without fetching',
  (providerId, createProvider) => {
    expect(createProvider(ky).id).toBe(providerId);
  },
);
