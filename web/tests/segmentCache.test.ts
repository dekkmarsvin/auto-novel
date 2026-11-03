import { beforeEach, describe, expect, it, vi } from 'vitest';

const boundary = vi.hoisted(() => ({ open: vi.fn() }));
vi.mock('idb', () => ({ openDB: boundary.open }));

type Entry = { key: string; translatedLines: string[]; lastAccessedAt: number };

// The IDB boundary supplies transactional stores/cursors; production cache code
// chooses the database, table, access order and eviction/clear operations.
function database() {
  const stores = new Map<string, Map<string, Entry>>();
  const createObjectStore = vi.fn((name: string) => {
    stores.set(name, new Map());
    return { createIndex: vi.fn() };
  });
  const transaction = vi.fn((name: string, mode: string) => {
    expect(mode).toBe('readwrite');
    const entries = stores.get(name)!;
    const cursor = (keys: string[], position = 0): unknown => {
      const key = keys[position];
      return key === undefined
        ? null
        : {
            value: structuredClone(entries.get(key)),
            delete: async () => {
              entries.delete(key);
            },
            continue: async () => cursor(keys, position + 1),
          };
    };
    return {
      store: {
        get: async (key: string) => {
          const entry = entries.get(key);
          return entry && structuredClone(entry);
        },
        put: async (entry: Entry) => {
          entries.set(entry.key, structuredClone(entry));
        },
        count: async () => entries.size,
        index: () => ({
          openCursor: async (_query: null, direction?: string) => {
            const sorted = [...entries.values()].sort((a, b) =>
              direction === 'prev'
                ? b.lastAccessedAt - a.lastAccessedAt
                : a.lastAccessedAt - b.lastAccessedAt,
            );
            return cursor(sorted.map((entry) => entry.key));
          },
        }),
      },
      done: Promise.resolve(),
      abort: vi.fn(),
    };
  });
  return {
    stores,
    createObjectStore,
    transaction,
    clear: vi.fn(async (name: string) => {
      stores.get(name)!.clear();
    }),
    close: vi.fn(),
  };
}

beforeEach(() => {
  vi.resetModules();
  boundary.open.mockReset();
});

async function setup(maxEntries = 2) {
  const db = database();
  boundary.open.mockImplementation(async (_name, _version, options) => {
    options.upgrade(db);
    return db;
  });
  const { IndexedDbSegmentCache } =
    await import('../src/domain/translator/segment-cache');
  return {
    db,
    gpt: new IndexedDbSegmentCache('gpt-seg-cache', maxEntries),
    sakura: new IndexedDbSegmentCache('sakura-seg-cache', maxEntries),
    IndexedDbSegmentCache,
  };
}

describe('workspace segment cache', () => {
  it('uses a separate database without reading or clearing the legacy cache', async () => {
    const { db, gpt, sakura } = await setup();
    expect(await gpt.get('missing')).toBeUndefined();
    await gpt.set('same-key', ['GPT']);
    await sakura.set('same-key', ['Sakura']);
    expect(await gpt.get('same-key')).toEqual(['GPT']);
    expect(await sakura.get('same-key')).toEqual(['Sakura']);
    expect(boundary.open).toHaveBeenCalledOnce();
    expect(boundary.open.mock.calls[0].slice(0, 2)).toEqual([
      'auto-novel:segment-cache',
      1,
    ]);
    expect([...db.stores.keys()]).toEqual([
      'gpt-seg-cache',
      'sakura-seg-cache',
    ]);
    await gpt.clear();
    expect(await gpt.get('same-key')).toBeUndefined();
    expect(await sakura.get('same-key')).toEqual(['Sakura']);
    expect(db.clear).toHaveBeenCalledExactlyOnceWith('gpt-seg-cache');
  });

  it('evicts the least recently used entry per table across cache instances', async () => {
    const { db, gpt, sakura, IndexedDbSegmentCache } = await setup();
    const otherTab = new IndexedDbSegmentCache('gpt-seg-cache', 2);
    await gpt.set('old', ['old']);
    await gpt.set('recent', ['recent']);
    expect(await otherTab.get('old')).toEqual(['old']);
    await otherTab.set('new', ['new']);
    expect(await gpt.get('recent')).toBeUndefined();
    expect(await gpt.get('old')).toEqual(['old']);
    await sakura.set('independent', ['Sakura']);
    expect(db.stores.get('gpt-seg-cache')!.size).toBe(2);
    expect(await sakura.get('independent')).toEqual(['Sakura']);
  });

  it('copies input/output at the IDB boundary and retries a failed connection', async () => {
    const { gpt } = await setup();
    boundary.open.mockRejectedValueOnce(new Error('storage denied'));
    await expect(gpt.get('key')).rejects.toThrow('storage denied');
    const lines = ['original'];
    await gpt.set('key', lines);
    lines[0] = 'mutated input';
    const result = (await gpt.get('key'))!;
    result[0] = 'mutated output';
    expect(await gpt.get('key')).toEqual(['original']);
    expect(boundary.open).toHaveBeenCalledTimes(2);
  });

  it.each([0, -1, 1.5, Infinity])(
    'rejects invalid entry bounds %s',
    async (limit) => {
      const { IndexedDbSegmentCache } = await setup();
      expect(() => new IndexedDbSegmentCache('gpt-seg-cache', limit)).toThrow(
        RangeError,
      );
      expect(boundary.open).not.toHaveBeenCalled();
    },
  );
});
