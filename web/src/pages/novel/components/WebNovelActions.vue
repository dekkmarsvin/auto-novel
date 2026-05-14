<script lang="ts" setup>
import { BookOutlined, EditNoteOutlined, SyncOutlined } from '@vicons/material';

import { CrawlerService } from '@/domain/crawler';
import type { WebNovelDto } from '@/model/WebNovel';
import { doAction } from '@/pages/util';
import { useWhoamiStore } from '@/stores';

const props = defineProps<{
  providerId: string;
  novelId: string;
  novel: WebNovelDto;
}>();

const whoamiStore = useWhoamiStore();
const { whoami } = storeToRefs(whoamiStore);
const message = useMessage();

const startReadChapter = computed(() => {
  const { novel } = props;
  if (novel.lastReadChapterId !== undefined) {
    const lastReadChapter = novel.toc.find(
      (it) => it.chapterId === novel.lastReadChapterId,
    );
    if (lastReadChapter !== undefined) {
      return { chapter: lastReadChapter, type: 'continue' as const };
    }
  }

  const firstChapter = novel.toc.find((it) => it.chapterId !== undefined);
  if (firstChapter !== undefined) {
    return { chapter: firstChapter, type: 'first' as const };
  }

  return undefined;
});

const updateNovel = () => {
  return doAction(
    CrawlerService.updateWebNovel(props.providerId, props.novelId),
    '更新小说',
    message,
  );
};
</script>

<template>
  <n-flex>
    <router-link
      v-if="startReadChapter !== undefined"
      :to="`/novel/${providerId}/${novelId}/${startReadChapter.chapter.chapterId}`"
    >
      <c-button
        :label="startReadChapter.type === 'continue' ? '继续阅读' : '开始阅读'"
        :round="false"
      />
    </router-link>
    <c-button v-else label="开始阅读" :round="false" disabled />

    <FavoriteButton
      v-model:favored="novel.favored"
      :novel="{ type: 'web', providerId, novelId }"
    />

    <c-button
      v-if="whoami.hasNovelAccess"
      label="更新"
      :round="false"
      :icon="SyncOutlined"
      @action="updateNovel()"
    />

    <router-link
      v-if="whoami.hasNovelAccess"
      :to="`/novel-edit/${providerId}/${novelId}`"
    >
      <c-button label="编辑" :round="false" :icon="EditNoteOutlined" />
    </router-link>

    <router-link v-if="novel.wenkuId" :to="`/wenku/${novel.wenkuId}`">
      <c-button label="文库" :round="false" :icon="BookOutlined" />
    </router-link>
  </n-flex>
</template>
