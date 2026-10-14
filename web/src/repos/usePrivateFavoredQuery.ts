import { useQuery, useQueryCache, type EntryKey } from '@pinia/colada';
import { computed, nextTick, watch } from 'vue';
import { useWhoamiStore } from '@/stores/useWhoamiStore';

/** Account changes must never retain the previous viewer's private page. */
export function usePrivateFavoredQuery<T>(
  prefix: string,
  parameters: () => EntryKey,
  query: (signal: AbortSignal) => Promise<T>,
) {
  const session = useWhoamiStore();
  const viewer = computed(() => session.whoami.user?.id);
  const cache = useQueryCache();
  watch(
    viewer,
    (_current, previous) => {
      if (previous === undefined) return;
      const filter = { key: [prefix, previous] };
      cache.cancelQueries(filter);
      for (const entry of cache.getEntries(filter)) {
        // Clear immediately; detach consumers before evicting their old entry.
        cache.setQueryData(entry.key, undefined);
        void nextTick(() => {
          if (!entry.active) cache.remove(entry);
        });
      }
    },
    { flush: 'sync' },
  );
  return useQuery<T>({
    key: () => [prefix, viewer.value ?? 'guest', ...parameters()],
    enabled: () => viewer.value !== undefined,
    placeholderData: () => undefined,
    query: ({ signal }) => query(signal),
  });
}
