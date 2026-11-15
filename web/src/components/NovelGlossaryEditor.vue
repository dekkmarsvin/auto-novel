<script lang="ts" setup>
import { isCurrentAuthor } from '@/identity';
import { useEventListener } from '@vueuse/core';
import { DeleteOutlineOutlined, EditOutlined } from '@vicons/material';
import {
  copyToClipboard,
  Toast,
  XConfirmDialog,
  getApiErrorMessage,
} from '@novelia/web-kit';

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
  termsToAdd,
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
    {
      success: '术语表提交成功',
      error: (reason) => getApiErrorMessage(reason, '术语表提交失败'),
    },
  ).catch(() => {});
};

const importGlossaryRaw = ref('');

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
    error: (reason) => getApiErrorMessage(reason, '导出失败'),
  }).catch(() => {});

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
    <div class="mb-4 flex max-w-125 flex-col gap-y-3">
      <h3 class="heading-bar">编辑术语表</h3>
      <template v-if="gnidHint">
        <span class="text-default text-[12px]">{{ gnidHint }}</span>

        <div v-if="gnid?.type !== 'local'" class="flex items-center gap-2">
          <span>绑定的共用术语表：</span>
          <USelect
            :model-value="localThemeGlossaryId ?? ''"
            @update:model-value="localThemeGlossaryId = $event || null"
            :loading="themeGlossariesLoading"
            :disabled="themeGlossariesLoading"
            :items="[
              { label: '无', value: '' },
              ...themeGlossaries.map((g) => ({
                label: isCurrentAuthor(whoami, g.authorUsername)
                  ? g.name
                  : `${g.name}（${g.authorUsername}）`,
                value: g.id,
              })),
            ]"
            size="sm"
            class="w-50"
            aria-label="绑定的共用术语表"
          />
        </div>
        <span v-if="themeGlossariesLoading" class="text-muted">
          载入共用术语表中…
        </span>
        <div v-else-if="themeGlossariesError" class="flex items-center gap-2">
          <span class="text-error">共用术语表载入失败</span>
          <ActionButton size="sm" :action="loadThemeGlossaries">
            重试
          </ActionButton>
        </div>
        <span v-else-if="selectedThemeMissing" class="text-warning">
          绑定的共用术语表不存在，请重新选择。
        </span>
      </template>

      <UFieldGroup size="sm" class="w-full">
        <UInput
          v-model="termsToAdd[0]"
          placeholder="日文"
          aria-label="日文术语"
          :spellcheck="false"
          class="min-w-0 flex-1"
        />
        <span
          class="flex items-center border border-default px-2 text-muted"
          aria-hidden="true"
        >
          =&gt;
        </span>
        <UInput
          v-model="termsToAdd[1]"
          placeholder="中文"
          aria-label="中文翻译"
          :spellcheck="false"
          class="min-w-0 flex-1"
        />
        <UButton
          color="neutral"
          variant="outline"
          @click="addTerm"
          class="shrink-0 justify-center"
        >
          添加
        </UButton>
      </UFieldGroup>

      <UTextarea
        v-model="importGlossaryRaw"
        size="sm"
        placeholder="批量导入术语表"
        :spellcheck="false"
        :rows="1"
        class="w-full"
      />

      <div class="flex items-center gap-x-3">
        <ActionButton
          class="rounded-md text-sm/4"
          size="sm"
          :action="exportGlossary"
        >
          导出
        </ActionButton>
        <ActionButton
          class="rounded-md text-sm/4"
          size="sm"
          :action="importGlossary"
        >
          导入
        </ActionButton>
        <ActionButton
          class="rounded-md text-sm/4"
          size="sm"
          :action="downloadGlossaryAsJsonFile"
        >
          下载json文件
        </ActionButton>
        <UButton
          v-if="whoami.isAdmin"
          color="error"
          size="sm"
          variant="soft"
          @click="clearTerm"
          class="text-sm/4"
        >
          清空
        </UButton>
      </div>

      <div class="flex items-center gap-x-3">
        <UButton
          color="neutral"
          variant="outline"
          :disabled="deletedTerms.length === 0"
          size="sm"
          @click="undoDeleteTerm"
          class="text-sm/4"
        >
          撤销删除
        </UButton>
        <span
          class="text-muted text-[12px]"
          v-if="lastDeletedTerm !== undefined"
        >
          {{ lastDeletedTerm }}
        </span>
      </div>
    </div>

    <USelect
      v-if="hasSharedTerms"
      v-model="termFilter"
      :items="termFilterOptions"
      size="sm"
      class="mb-2"
      aria-label="术语筛选"
    />
    <UScrollArea
      v-if="termRows.length !== 0"
      class="mb-4 max-h-[400px] max-w-[500px]"
    >
      <table
        class="content-table w-full rounded-[3px] border border-default text-[12px] [&>tbody>tr:nth-child(even)]:bg-surface"
      >
        <tbody>
          <tr v-for="row in visibleTermRows" :key="row.jp">
            <td>
              <ActionButton
                v-if="row.kind === 'shared'"
                size="sm"
                variant="link"
                square
                class="p-0"
                :action="() => overrideTerm(row.jp)"
                aria-label="在本书中覆盖此术语"
                :icon="EditOutlined"
                :ui="{ leadingIcon: 'size-4.5' }"
              />
              <ActionButton
                v-else
                color="error"
                size="sm"
                variant="link"
                square
                class="p-0"
                :action="() => deleteTerm(row.jp)"
                aria-label="删除"
                :icon="DeleteOutlineOutlined"
                :ui="{ leadingIcon: 'size-4.5' }"
              />
            </td>
            <td v-if="hasSharedTerms">
              <UBadge
                :color="termKindTag[row.kind].type"
                size="sm"
                variant="soft"
              >
                {{ termKindTag[row.kind].label }}
              </UBadge>
            </td>
            <td>{{ row.jp }}</td>
            <td class="whitespace-nowrap">=&gt;</td>
            <td class="pr-4!">
              <span v-if="row.kind === 'shared'" class="text-muted">
                {{ selectedThemeGlossary[row.jp] }}
              </span>
              <template v-else>
                <UInput
                  v-model="glossary[row.jp]"
                  size="xs"
                  placeholder="请输入中文翻译"
                  variant="none"
                  class="w-full"
                />
                <span
                  v-if="row.kind === 'override'"
                  class="text-muted text-[11px] line-through"
                >
                  共用：{{ selectedThemeGlossary[row.jp] }}
                </span>
              </template>
            </td>
          </tr>
        </tbody>
      </table>
    </UScrollArea>

    <div class="flex max-w-125 flex-wrap justify-end gap-x-3 gap-y-2">
      <ActionButton
        color="primary"
        :action="() => submitGlossary()"
        variant="solid"
      >
        提交
      </ActionButton>
    </div>

    <XConfirmDialog
      :open="showConfirmModal"
      title="提示"
      description="检测到未保存的修改，确认关闭吗？"
      @update:open="handleModalUpdateShow"
      @confirm="handleConfirmClose"
    />
  </div>
</template>
