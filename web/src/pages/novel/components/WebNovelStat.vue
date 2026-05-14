<script lang="ts" setup>
const props = defineProps<{
  providerId: string;
  type: string;
  points?: number;
  totalCharacters?: number;
  visited: number;
  latestChapterCreateAt?: number;
}>();

const readableNumber = (num: number | undefined) => {
  if (typeof num !== 'number') return undefined;
  if (num < 1000) return num.toString();
  return `${(num / 1000).toFixed(1)}k`;
};

const withPointDeco = (str: string | undefined) => {
  if (typeof str !== 'string') return undefined;
  if (props.providerId === 'kakuyomu') return `★${str}`;
  return `${str} PT`;
};

const points = computed(() => withPointDeco(readableNumber(props.points)));
const totalCharacters = computed(() => readableNumber(props.totalCharacters));
const visited = computed(() => readableNumber(props.visited) ?? '0');
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
      <n-text style="font-size: 12px; line-height: 1.25">
        {{ totalCharacters === undefined ? 'NA' : `${totalCharacters} 字` }}
      </n-text>
    </div>
    <n-divider vertical class="metadata-stat-divider" />

    <div class="metadata-stat-item">
      <n-text depth="3" style="font-size: 12px; line-height: 1.2">
        更新时间
      </n-text>
      <n-text style="font-size: 12px; line-height: 1.25">
        <n-time
          v-if="latestChapterCreateAt"
          :time="latestChapterCreateAt * 1000"
          type="date"
        />
        <template v-else>NA</template>
      </n-text>
    </div>
    <n-divider vertical class="metadata-stat-divider" />

    <div class="metadata-stat-item">
      <n-text depth="3" style="font-size: 12px; line-height: 1.2">浏览</n-text>
      <n-text style="font-size: 12px; line-height: 1.25">
        {{ visited }}
      </n-text>
    </div>
    <n-divider v-if="points" vertical class="metadata-stat-divider" />

    <div v-if="points" class="metadata-stat-item">
      <n-text depth="3" style="font-size: 12px; line-height: 1.2">点数</n-text>
      <n-text style="font-size: 12px; line-height: 1.25">
        {{ points }}
      </n-text>
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
