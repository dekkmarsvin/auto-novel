import { computed, ref, watch } from 'vue';

export function useDuplicateSearch<T>(
  title: () => string,
  search: () => Promise<T[]>,
) {
  const items = ref<T[] | null>(null);
  const failed = ref(false);
  const canConfirm = computed(() => items.value !== null || failed.value);
  watch(title, () => {
    items.value = null;
    failed.value = false;
  });
  const run = async () => {
    const target = title();
    failed.value = false;
    try {
      const result = await search();
      if (title() === target) items.value = result as typeof items.value;
    } catch (error) {
      if (title() === target) failed.value = true;
      return error;
    }
  };
  return { items, failed, canConfirm, run };
}
