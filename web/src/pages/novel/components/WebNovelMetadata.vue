<script lang="ts" setup>
import type { WebNovelDto } from '@/model/WebNovel';

const props = defineProps<{
  providerId: string;
  novelId: string;
  novel: WebNovelDto;
}>();

const labels = computed(() => {
  const readableNumber = (num: number | undefined) => {
    if (typeof num !== 'number') return undefined;
    if (num < 1000) return num.toString();
    else return (num / 1000).toFixed(1).toString() + 'k';
  };

  const withPointDeco = (str: string | undefined) => {
    if (typeof str !== 'string') return undefined;
    if (props.providerId === 'kakuyomu') return '★' + str;
    else return str + ' PT';
  };

  const labels = [
    props.novel.type,
    withPointDeco(readableNumber(props.novel.points)),
    readableNumber(props.novel.totalCharacters) + ' 字',
    readableNumber(props.novel.visited) + ' 浏览',
  ]
    .filter(Boolean)
    .join(' / ');
  return labels;
});

const includesWhitespace = (s: string) => s.includes(' ') || s.includes('　');

const generateSearchUrl = (query: string) => {
  if (includesWhitespace(query)) {
    query = `"${query}"`;
  }
  return `/novel?query=${encodeURIComponent(query)}`;
};

const latestChapterCreateAt = computed(() => {
  const { novel } = props;
  const createAtList = novel.toc
    .map((it) => it.createAt)
    .filter((it): it is number => it !== undefined);
  if (createAtList.length === 0) return undefined;
  else return Math.max(...createAtList);
});
</script>

<template>
  <WebNovelTitle
    :provider-id="providerId"
    :novel-id="novelId"
    :title-jp="novel.titleJp"
    :title-zh="novel.titleZh"
  />

  <n-p v-if="novel.authors.length > 0">
    作者：
    <template v-for="author in novel.authors" :key="author.name">
      <n-a :href="author.link">{{ author.name }}</n-a>
    </template>
  </n-p>

  <WebNovelActions
    :provider-id="providerId"
    :novel-id="novelId"
    :novel="novel"
  />

  <n-p>{{ labels }}</n-p>

  <n-p>
    <template v-if="latestChapterCreateAt">
      最近更新于
      <n-time :time="latestChapterCreateAt * 1000" type="date" />
      /
    </template>
    <c-a :to="generateSearchUrl(novel.titleJp)">搜索标题</c-a>
    <template v-if="novel.authors">
      /
      <c-a :to="generateSearchUrl(novel.authors[0].name)">搜索作者</c-a>
    </template>
  </n-p>

  <WebNovelTags :attentions="novel.attentions" :keywords="novel.keywords" />

  <n-divider />

  <WebNovelIntroduction
    :introduction-jp="novel.introductionJp"
    :introduction-zh="novel.introductionZh"
  />
</template>
