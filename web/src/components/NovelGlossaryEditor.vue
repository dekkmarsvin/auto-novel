<script lang="ts" setup>
import { isCurrentAuthor } from '@/identity';
import { useEventListener } from '@vueuse/core';
import { DeleteOutlineOutlined, EditOutlined } from '@vicons/material';
import { copyToClipboard, Toast, XConfirmDialog } from '@novelia/web-kit';

import { useQueryCache } from '@pinia/colada';
import { ThemeGlossaryApi } from '@/api/novel/ThemeGlossaryApi';
import { GenericNovelId } from '@/model/Common';
import { Glossary } from '@/model/Glossary';
import type { ThemeGlossaryDto } from '@/model/ThemeGlossary';
import { useLocalVolumeStore, useWhoamiStore } from '@/stores';
import { downloadFile } from '@/util';
import {
  type GlossaryTermKind,
  mergeGlossaryTerms,
  saveGlossaryDraft,
  useGlossaryDraft,
} from './glossaryDraft';
import { useGlossaryNavigationGuard } from './glossaryNavigation';

const props = defineProps<{
  gnid?: GenericNovelId;
  value: Glossary;
  themeGlossaryId?: string;
}>();

const emit = defineEmits<{
  'update:themeGlossaryId': [id?: string];
}>();

const showConfirmModal = ref(false);
const pendingConfirmResolve = ref<((value: boolean) => void) | null>(null);

const cancelPendingNavigation = () => {
  if (pendingConfirmResolve.value) {
    pendingConfirmResolve.value(false);
    pendingConfirmResolve.value = null;
  }
  showConfirmModal.value = false;
};

const handleConfirmClose = () => {
  showConfirmModal.value = false;
  if (pendingConfirmResolve.value) {
    resetState();
    pendingConfirmResolve.value(true);
    pendingConfirmResolve.value = null;
  }
};

const handleModalUpdateShow = (show: boolean) => {
  if (!show) {
    cancelPendingNavigation();
  }
};

const confirmLeave = () => {
  if (isGlossaryChanged()) {
    return new Promise<boolean>((resolve) => {
      cancelPendingNavigation();
      pendingConfirmResolve.value = resolve;
      showConfirmModal.value = true;
    });
  }
  return true;
};

useGlossaryNavigationGuard(confirmLeave);

useEventListener(window, 'beforeunload', (e) => {
  if (isGlossaryChanged()) {
    e.preventDefault();
    return '检测到未保存的修改，确认关闭吗？';
  }
});

const whoamiStore = useWhoamiStore();
const { whoami } = storeToRefs(whoamiStore);

const queryCache = useQueryCache();
const themeGlossaries = ref<ThemeGlossaryDto[]>([]);
const {
  glossary,
  themeGlossaryId: localThemeGlossaryId,
  resetState,
  isGlossaryChanged,
  submit,
} = useGlossaryDraft(
  () => ({
    glossary: props.value,
    themeGlossaryId: props.themeGlossaryId,
  }),
  () => props.gnid && GenericNovelId.toString(props.gnid),
);

const themeGlossariesLoading = ref(false);
const themeGlossariesLoaded = ref(false);
const themeGlossariesError = ref(false);

const loadThemeGlossaries = async () => {
  themeGlossariesLoading.value = true;
  themeGlossariesError.value = false;
  try {
    themeGlossaries.value = await ThemeGlossaryApi.list();
    themeGlossariesLoaded.value = true;
  } catch (error) {
    themeGlossariesError.value = true;
    Toast.error(`载入主题术语表失败: ${error}`);
  } finally {
    themeGlossariesLoading.value = false;
  }
};

onMounted(() => {
  if (!props.gnid || props.gnid.type === 'local') return;
  void loadThemeGlossaries();
});

const gnidHint = computed(() => {
  const gnid = props.gnid;
  if (gnid === undefined) {
    return undefined;
  } else {
    return GenericNovelId.toString(gnid);
  }
});

const submitGlossary = () => {
  const gnid = props.gnid;
  if (!gnid) return;
  const targetGlossary = props.value;
  return Toast.promise(
    submit(
      (submitted) =>
        saveGlossaryDraft(gnid, submitted, async (volumeId, value) => {
          const repo = await useLocalVolumeStore();
          await repo.updateGlossary(volumeId, value);
        }),
      (submitted) => {
        for (const key in targetGlossary) {
          delete targetGlossary[key];
        }
        Object.assign(targetGlossary, submitted.glossary);
        emit('update:themeGlossaryId', submitted.themeGlossaryId);
        if (gnid.type === 'web') {
          queryCache.invalidateQueries({
            key: ['web-novel', gnid.providerId, gnid.novelId],
            exact: true,
          });
        } else if (gnid.type === 'wenku') {
          queryCache.invalidateQueries({
            key: ['wenku-novel', gnid.novelId],
            exact: true,
          });
        }
      },
    ),
    { success: '术语表提交成功', error: '术语表提交失败' },
  );
};

const importGlossaryRaw = ref('');
const termsToAdd = ref<[string, string]>(['', '']);

const deletedTerms = ref<[string, string][]>([]);

const lastDeletedTerm = computed(() => {
  const last = deletedTerms.value[deletedTerms.value.length - 1];
  if (last === undefined) return undefined;
  return `${last[0]} => ${last[1]}`;
});

const clearTerm = () => {
  glossary.value = {};
};

const undoDeleteTerm = () => {
  if (deletedTerms.value.length === 0) return;
  const [jp, zh] = deletedTerms.value.pop()!;
  glossary.value[jp] = zh;
};

type TermFilter = 'all' | 'own' | 'shared' | 'override';

const termKindTag = {
  own: { label: '专属', type: 'success' },
  override: { label: '覆盖', type: 'warning' },
  shared: { label: '共用', type: 'info' },
} as const;

// 跟随下拉框中尚未提交的选择，即时预览覆盖关系
const selectedThemeGlossary = computed<Glossary>(
  () =>
    themeGlossaries.value.find((g) => g.id === localThemeGlossaryId.value)
      ?.glossary ?? {},
);
const hasSharedTerms = computed(
  () => Object.keys(selectedThemeGlossary.value).length !== 0,
);
const selectedThemeMissing = computed(
  () =>
    themeGlossariesLoaded.value &&
    !!localThemeGlossaryId.value &&
    !themeGlossaries.value.some((g) => g.id === localThemeGlossaryId.value),
);

const termRows = computed(() =>
  mergeGlossaryTerms(glossary.value, selectedThemeGlossary.value),
);

const termFilter = ref<TermFilter>('all');

const termFilterOptions = computed(() => {
  const rows = termRows.value;
  const count = (kind: GlossaryTermKind) =>
    rows.filter((r) => r.kind === kind).length;
  const own = count('own');
  const override = count('override');
  const shared = count('shared');
  return [
    { label: `全部 ${rows.length}`, value: 'all' },
    { label: `专属 ${own + override}`, value: 'own' },
    { label: `共用 ${shared + override}`, value: 'shared' },
    { label: `覆盖 ${override}`, value: 'override' },
  ];
});

const visibleTermRows = computed(() => {
  const filter = hasSharedTerms.value ? termFilter.value : 'all';
  if (filter === 'all') return termRows.value;
  return termRows.value.filter(
    (r) =>
      r.kind === filter ||
      (r.kind === 'override' && (filter === 'own' || filter === 'shared')),
  );
});

const overrideTerm = (jp: string) => {
  glossary.value[jp] = selectedThemeGlossary.value[jp];
};

const deleteTerm = (jp: string) => {
  if (jp in glossary.value) {
    deletedTerms.value.push([jp, glossary.value[jp]]);
    delete glossary.value[jp];
  }
};

const addTerm = () => {
  const [jp, zh] = termsToAdd.value;
  if (jp && zh) {
    glossary.value[jp.trim()] = zh.trim();
    termsToAdd.value = ['', ''];
  }
};

const exportGlossary = () =>
  Toast.promise(copyToClipboard(Glossary.toText(glossary.value)), {
    success: '导出成功：已复制到剪贴板',
    error: '导出失败',
  });

const importGlossary = () => {
  const importedGlossary = Glossary.fromText(importGlossaryRaw.value);
  if (importedGlossary === undefined) {
    Toast.error('导入失败：术语表格式不正确');
  } else {
    Toast.success('导入成功');
    for (const jp in importedGlossary) {
      const zh = importedGlossary[jp];
      glossary.value[jp] = zh;
    }
  }
};

const downloadGlossaryAsJsonFile = async () => {
  downloadFile(
    `${gnidHint.value ?? 'glossary'}.json`,
    new Blob([Glossary.toJson(glossary.value)], {
      type: 'text/plain',
    }),
  );
};

defineExpose({
  isGlossaryChanged,
  resetState,
  confirmLeave,
});
</script>

<template>
  <div class="novel-glossary-editor">
    <n-flex vertical size="large" style="max-width: 500px; margin-bottom: 16px">
      <n-h3 prefix="bar">编辑术语表</n-h3>
      <template v-if="gnidHint">
        <n-text style="font-size: 12px">{{ gnidHint }}</n-text>

        <n-flex v-if="gnid?.type !== 'local'" align="center">
          <n-text>绑定的共用术语表：</n-text>
          <n-select
            v-model:value="localThemeGlossaryId"
            :loading="themeGlossariesLoading"
            :disabled="themeGlossariesLoading"
            :options="[
              { label: '无', value: '' },
              ...themeGlossaries.map((g) => ({
                label: isCurrentAuthor(whoami, g.authorUsername)
                  ? g.name
                  : `${g.name}（${g.authorUsername}）`,
                value: g.id,
              })),
            ]"
            size="small"
            style="width: 200px"
          />
        </n-flex>
        <n-text v-if="themeGlossariesLoading" depth="3">
          载入共用术语表中…
        </n-text>
        <n-flex v-else-if="themeGlossariesError" align="center">
          <n-text type="error">共用术语表载入失败</n-text>
          <c-button label="重试" size="small" @action="loadThemeGlossaries" />
        </n-flex>
        <n-text v-else-if="selectedThemeMissing" type="warning">
          绑定的共用术语表不存在，请重新选择。
        </n-text>
      </template>

      <n-input-group>
        <n-input
          pair
          v-model:value="termsToAdd"
          size="small"
          separator="=>"
          :placeholder="['日文', '中文']"
          :input-props="{ spellcheck: false }"
        />
        <c-button label="添加" :round="false" size="small" @action="addTerm" />
      </n-input-group>

      <n-input
        v-model:value="importGlossaryRaw"
        type="textarea"
        size="small"
        placeholder="批量导入术语表"
        :input-props="{ spellcheck: false }"
        :rows="1"
      />

      <n-flex align="center" :wrap="false">
        <c-button
          label="导出"
          :round="false"
          size="small"
          @action="exportGlossary"
        />
        <c-button
          label="导入"
          :round="false"
          size="small"
          @action="importGlossary"
        />
        <c-button
          label="下载json文件"
          :round="false"
          size="small"
          @action="downloadGlossaryAsJsonFile"
        />
        <c-button
          v-if="whoami.isAdmin"
          secondary
          type="error"
          label="清空"
          :round="false"
          size="small"
          @action="clearTerm"
        />
      </n-flex>

      <n-flex align="center" :wrap="false">
        <c-button
          :disabled="deletedTerms.length === 0"
          label="撤销删除"
          :round="false"
          size="small"
          @action="undoDeleteTerm"
        />
        <n-text
          v-if="lastDeletedTerm !== undefined"
          depth="3"
          style="font-size: 12px"
        >
          {{ lastDeletedTerm }}
        </n-text>
      </n-flex>
    </n-flex>

    <c-radio-group
      v-if="hasSharedTerms"
      v-model:value="termFilter"
      :options="termFilterOptions"
      size="small"
      style="margin-bottom: 8px"
    />

    <n-scrollbar
      v-if="termRows.length !== 0"
      style="max-height: 400px; max-width: 500px; margin-bottom: 16px"
    >
      <n-table striped size="small" style="font-size: 12px; width: 100%">
        <tr v-for="row in visibleTermRows" :key="row.jp">
          <td>
            <c-button
              v-if="row.kind === 'shared'"
              :icon="EditOutlined"
              text
              size="small"
              title="在本书中覆盖此术语"
              @action="overrideTerm(row.jp)"
            />
            <c-button
              v-else
              :icon="DeleteOutlineOutlined"
              text
              type="error"
              size="small"
              @action="deleteTerm(row.jp)"
            />
          </td>
          <td v-if="hasSharedTerms">
            <n-tag
              :type="termKindTag[row.kind].type"
              size="small"
              :bordered="false"
            >
              {{ termKindTag[row.kind].label }}
            </n-tag>
          </td>
          <td>{{ row.jp }}</td>
          <td nowrap="nowrap">=></td>
          <td style="padding-right: 16px">
            <n-text v-if="row.kind === 'shared'" depth="2">
              {{ selectedThemeGlossary[row.jp] }}
            </n-text>
            <template v-else>
              <n-input
                v-model:value="glossary[row.jp]"
                size="tiny"
                placeholder="请输入中文翻译"
                :theme-overrides="{
                  border: '0',
                  color: 'transparent',
                }"
              />
              <n-text
                v-if="row.kind === 'override'"
                depth="3"
                delete
                style="font-size: 11px"
              >
                共用：{{ selectedThemeGlossary[row.jp] }}
              </n-text>
            </template>
          </td>
        </tr>
      </n-table>
    </n-scrollbar>

    <n-flex justify="end" style="max-width: 500px">
      <c-button label="提交" type="primary" @action="submitGlossary()" />
    </n-flex>

    <XConfirmDialog
      :open="showConfirmModal"
      title="提示"
      description="检测到未保存的修改，确认关闭吗？"
      @update:open="handleModalUpdateShow"
      @confirm="handleConfirmClose"
    />
  </div>
</template>
