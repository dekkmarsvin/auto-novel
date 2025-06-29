<script lang="ts" setup>
import { StarFilled } from '@vicons/material';

import { WenkuNovelOutlineDto } from '@/model/WenkuNovel';

const props = defineProps<{
  items: WenkuNovelOutlineDto[];
  selectable?: boolean;
}>();

const selectedIds = ref<string[]>([]);
const selectedNovels = computed(() =>
  props.items.filter(({ id }) => selectedIds.value.includes(id)),
);

watch(
  () => props.selectable,
  (selectable) => {
    if (selectable !== false) {
      selectedIds.value = [];
    }
  },
);
const toggleNovelSelect = (novel: string, selected: boolean) => {
  if (selected) {
    selectedIds.value.push(novel);
  } else {
    selectedIds.value = selectedIds.value.filter((it) => it != novel);
  }
};

const getSelectedNovels = () => {
  return props.items.filter((it) => selectedIds.value.includes(it.id));
};

defineExpose({
  selectedNovels,
  getSelectedNovels,
  selectAll: () => {
    selectedIds.value = props.items.map((it) => it.id);
  },
  invertSelection: () => {
    selectedIds.value = props.items
      .map((it) => it.id)
      .filter((it) => !selectedIds.value.includes(it));
  },
});
</script>

<template>
  <n-grid :x-gap="12" :y-gap="12" cols="2 500:3 800:4">
    <n-grid-item v-for="item in items" :key="item.id">
      <div style="position: relative">
        <router-link :to="`/wenku/${item.id}`">
          <ImageCard
            :src="item.cover"
            :title="item.titleZh ? item.titleZh : item.title"
          >
            <template #prefix>
              <n-text v-if="item.favored" type="warning">
                <n-icon :size="16" :component="StarFilled" />
              </n-text>
            </template>
          </ImageCard>
        </router-link>

        <c-select-overlay
          v-if="selectable"
          :checked="selectedIds.includes(item.id)"
          @update:checked="
            (checked: boolean) => toggleNovelSelect(item.id, checked)
          "
        />
      </div>
    </n-grid-item>
  </n-grid>
</template>
