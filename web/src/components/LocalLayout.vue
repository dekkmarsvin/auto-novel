<script setup lang="ts">
import type { WebKitMenuOption } from '@novelia/web-kit';
import { localWhoami, toggleLocalManageMode } from '@/runtimeClients';

const props = defineProps<{ navigationOptions: WebKitMenuOption[] }>();
const links = computed(() =>
  props.navigationOptions
    .flatMap((item) => (item.type === 'group' ? item.children : [item]))
    .filter(
      (item): item is Extract<WebKitMenuOption, { to: unknown }> =>
        item.type === undefined || item.type === 'link',
    ),
);
</script>

<template>
  <nav class="local-navigation">
    <RouterLink v-for="item in links" :key="item.key" :to="item.to">
      {{ item.label }}
    </RouterLink>
    <span>本地用户</span>
    <button type="button" @click="toggleLocalManageMode">
      {{ localWhoami.asAdmin ? '退出管理模式' : '管理模式' }}
    </button>
  </nav>
  <slot />
</template>

<style scoped>
.local-navigation {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  padding: 12px;
}
</style>
