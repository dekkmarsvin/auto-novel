<script lang="ts" setup>
import { WebUtil } from '@/util/web';

const props = defineProps<{
  attentions: string[];
  keywords: string[];
}>();

const sortedAttentions = computed(() => props.attentions.slice().sort());

const buildTagQuery = (tag: string) => `/novel?query=${tag}\$`;
</script>

<template>
  <n-flex :size="[4, 4]">
    <router-link
      v-for="attention of sortedAttentions"
      :key="attention"
      :to="buildTagQuery(attention)"
    >
      <novel-tag :tag="attention" strong />
    </router-link>

    <router-link
      v-for="keyword of keywords"
      :key="keyword"
      :to="buildTagQuery(keyword)"
    >
      <novel-tag :tag="WebUtil.tryTranslateKeyword(keyword)" />
    </router-link>
  </n-flex>
</template>
