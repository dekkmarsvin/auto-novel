<script lang="ts" setup>
const props = defineProps<{
  type: string;
  totalCharacters?: number;
  visited: number;
  latestChapterCreateAt?: number;
}>();

const formatExactNumber = (num: number | undefined) => {
  if (typeof num !== 'number') return undefined;
  return new Intl.NumberFormat('zh-CN').format(num);
};

const readableCharacterCount = (num: number | undefined) => {
  if (typeof num !== 'number') return undefined;

  const exact = formatExactNumber(num);
  if (num < 10000) return `${exact} 字`;

  const wan = (num / 10000).toFixed(num < 100000 ? 1 : 0).replace(/\.0$/, '');
  return `${wan} 万字`;
};

const readableCount = (num: number | undefined) => {
  if (typeof num !== 'number') return undefined;

  const exact = formatExactNumber(num);
  if (num < 10000) return exact;

  return `${(num / 10000).toFixed(num < 100000 ? 1 : 0).replace(/\.0$/, '')} 万`;
};

const totalCharacters = computed(() =>
  readableCharacterCount(props.totalCharacters),
);
const exactTotalCharacters = computed(() =>
  props.totalCharacters === undefined
    ? undefined
    : `${formatExactNumber(props.totalCharacters)} 字`,
);
const visited = computed(() => readableCount(props.visited) ?? '0');
const exactVisited = computed(() => formatExactNumber(props.visited) ?? '0');
</script>

<template>
  <n-flex :size="[20, 12]" style="width: 100%" align="stretch">
    <div class="metadata-stat-item">
      <n-text depth="3" style="font-size: 12px; line-height: 1.2">状态</n-text>
      <n-text style="font-size: 12px; line-height: 1.25">
        {{ type }}
      </n-text>
    </div>
    <n-divider vertical class="metadata-stat-divider" />

    <div class="metadata-stat-item">
      <n-text depth="3" style="font-size: 12px; line-height: 1.2">字数</n-text>
      <n-tooltip
        v-if="exactTotalCharacters"
        placement="top-start"
        trigger="click"
      >
        <template #trigger>
          <n-text style="font-size: 12px; line-height: 1.25">
            {{ totalCharacters }}
          </n-text>
        </template>
        {{ exactTotalCharacters }}
      </n-tooltip>
      <n-text v-else style="font-size: 12px; line-height: 1.25">NA</n-text>
    </div>
    <n-divider vertical class="metadata-stat-divider" />

    <div class="metadata-stat-item">
      <n-text depth="3" style="font-size: 12px; line-height: 1.2">
        更新时间
      </n-text>
      <n-tooltip
        v-if="latestChapterCreateAt"
        placement="top-start"
        trigger="click"
      >
        <template #trigger>
          <n-text style="font-size: 12px; line-height: 1.25">
            <n-time :time="latestChapterCreateAt * 1000" type="relative" />
          </n-text>
        </template>
        <n-time
          :time="latestChapterCreateAt * 1000"
          format="yyyy-MM-dd HH:mm"
        />
      </n-tooltip>
      <n-text v-else style="font-size: 12px; line-height: 1.25">NA</n-text>
    </div>
    <n-divider vertical class="metadata-stat-divider" />

    <div class="metadata-stat-item">
      <n-text depth="3" style="font-size: 12px; line-height: 1.2">浏览</n-text>
      <n-tooltip placement="top-start" trigger="click">
        <template #trigger>
          <n-text style="font-size: 12px; line-height: 1.25">
            {{ visited }}
          </n-text>
        </template>
        {{ exactVisited }}
      </n-tooltip>
    </div>
  </n-flex>
</template>

<style scoped>
.metadata-stat-item {
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.metadata-stat-divider {
  margin: 0;
  height: auto;
}
</style>
