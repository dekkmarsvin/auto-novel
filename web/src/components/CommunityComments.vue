<script setup lang="ts">
import CommentList from './comment/CommentList.vue';
import { commentsAvailable } from '@/config';
defineProps<{ site: string; locked: boolean; hideComment: boolean }>();
</script>

<template>
  <CommentList
    v-if="commentsAvailable(hideComment)"
    :site="site"
    :locked="locked"
  />
</template>
