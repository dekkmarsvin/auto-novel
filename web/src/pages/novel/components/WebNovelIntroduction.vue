<script lang="ts" setup>
const props = defineProps<{
  introductionJp: string;
  introductionZh?: string;
}>();

const hasTranslation = computed(() => props.introductionZh !== undefined);

const showTranslation = ref(hasTranslation.value);

watch(hasTranslation, (next, prev) => {
  if (next === prev) return;
  showTranslation.value = next;
});

const displayedIntroduction = computed(() => {
  if (showTranslation.value && props.introductionZh !== undefined) {
    return props.introductionZh;
  }
  return props.introductionJp;
});

const toggleTranslation = () => {
  if (!hasTranslation.value) return;
  showTranslation.value = !showTranslation.value;
};
</script>

<template>
  <n-p
    style="word-break: break-all; white-space: pre-wrap"
    @click="toggleTranslation"
  >
    {{ displayedIntroduction || '暂无简介' }}
  </n-p>
</template>
