<script lang="ts" setup>
import { UploadOutlined } from '@vicons/material';

import { doAction, useIsWideScreen } from '@/pages/util';
import { useWebNovelStore } from './WebNovelStore';

const { providerId, novelId } = defineProps<{
  providerId: string;
  novelId: string;
}>();

const router = useRouter();
const isWideScreen = useIsWideScreen();
const message = useMessage();

const store = useWebNovelStore(providerId, novelId);

const allowSubmit = ref(false);
const formValue = ref({
  titleJp: '',
  title: '',
  introductionJp: '',
  introduction: '',
  wenkuId: '',
  toc: <{ jp: string; zh: string }[]>[],
});

store.loadNovel().then((result) => {
  if (result.ok) {
    const tocSet = new Set();
    formValue.value = {
      titleJp: result.value.titleJp,
      title: result.value.titleZh ?? '',
      introductionJp: result.value.introductionJp,
      introduction: result.value.introductionZh ?? '',
      wenkuId: result.value.wenkuId ?? '',
      toc: result.value.toc
        .filter((item) => {
          const inSet = tocSet.has(item.titleJp);
          if (!inSet) tocSet.add(item.titleJp);
          return !inSet;
        })
        .map((item) => ({
          jp: item.titleJp,
          zh: item.titleZh ?? '',
        })),
    };
    allowSubmit.value = true;
  } else {
    message.error('载入失败');
  }
});

const submit = async () => {
  if (!allowSubmit.value) {
    message.warning('小说未载入，无法提交');
    return;
  }

  await doAction(
    store
      .updateNovel({
        title: formValue.value.title.trim(),
        introduction: formValue.value.introduction.trim(),
        wenkuId: formValue.value.wenkuId.trim(),
        toc: Object.assign(
          {},
          ...formValue.value.toc.map((item) => ({ [item.jp]: item.zh })),
        ),
      })
      .then(() => {
        router.push({ path: `/novel/${providerId}/${novelId}` });
      }),
    '编辑',
    message,
  );
};
</script>

<template>
  <div class="layout-content">
    <n-h1>编辑网络小说</n-h1>

    <n-form
      ref="formRef"
      :model="formValue"
      :label-placement="isWideScreen ? 'left' : 'top'"
      label-width="auto"
    >
      <n-form-item path="wenkuId" label="文库链接">
        <n-input-group>
          <n-input-group-label>wenku/</n-input-group-label>
          <n-input
            v-model:value="formValue.wenkuId"
            placeholder="文库版ID"
            :input-props="{ spellcheck: false }"
          />
        </n-input-group>
      </n-form-item>

      <n-form-item label="日文标题">
        {{ formValue.titleJp }}
      </n-form-item>
      <n-form-item path="title" label="中文标题">
        <n-input
          v-model:value="formValue.title"
          :placeholder="formValue.titleJp"
          :input-props="{ spellcheck: false }"
        />
      </n-form-item>

      <n-form-item label="日文简介">
        {{ formValue.introductionJp }}
      </n-form-item>
      <n-form-item path="introduction" label="中文简介">
        <n-input
          v-model:value="formValue.introduction"
          :placeholder="formValue.introductionJp"
          :input-props="{ spellcheck: false }"
          :autosize="{ minRows: 3, maxRows: 10 }"
          type="textarea"
        />
      </n-form-item>
    </n-form>

    <n-h2 prefix="bar">目录</n-h2>
    <n-p>
      <n-text type="error">
        注意，手动编辑目录可能会被其他人覆盖。如果你不满意目录的翻译，可以先用翻译器重翻试试。
      </n-text>
    </n-p>
    <n-table :bordered="false" :bottom-bordered="false" style="width: 100%">
      <tr v-for="token in formValue.toc" :key="token.jp">
        <td style="width: 50%; padding: 4px">
          {{ token.jp }}
          <br />
          <n-input
            v-if="!isWideScreen"
            v-model:value="token.zh"
            :placeholder="token.jp"
            :input-props="{ spellcheck: false }"
          />
        </td>
        <td v-if="isWideScreen" style="padding: 4px">
          <n-input
            v-model:value="token.zh"
            :placeholder="token.jp"
            :input-props="{ spellcheck: false }"
          />
        </td>
      </tr>
    </n-table>

    <n-divider />

    <c-button
      label="提交"
      :icon="UploadOutlined"
      require-login
      size="large"
      type="primary"
      class="float"
      @action="submit"
    />
  </div>
</template>
