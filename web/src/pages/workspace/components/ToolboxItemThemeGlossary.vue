<script lang="ts" setup>
import { isCurrentAuthor } from '@/identity';
import { onMounted, ref } from 'vue';
import { copyToClipboard, getApiErrorMessage, Toast } from '@novelia/web-kit';
import { DeleteOutlineOutlined } from '@vicons/material';

import { ThemeGlossaryApi } from '@/api/novel/ThemeGlossaryApi';
import type { ThemeGlossaryDto } from '@/model/ThemeGlossary';
import { Glossary } from '@/model/Glossary';
import { useWhoamiStore } from '@/stores';

const list = ref<ThemeGlossaryDto[]>([]);

const whoamiStore = useWhoamiStore();
const { whoami } = storeToRefs(whoamiStore);

const canEdit = (item: ThemeGlossaryDto) =>
  whoami.value.isAdmin || isCurrentAuthor(whoami.value, item.authorUsername);

const loadList = async () => {
  try {
    list.value = await ThemeGlossaryApi.list();
  } catch (e) {
    Toast.error(`载入失败: ${e}`);
  }
};

onMounted(loadList);

const showCreateModal = ref(false);
const newName = ref('');

const createThemeGlossary = async () => {
  if (!newName.value) {
    Toast.warning('请输入名称');
    return;
  }
  try {
    await ThemeGlossaryApi.create(newName.value, {});
    Toast.success('创建成功');
    showCreateModal.value = false;
    newName.value = '';
    await loadList();
  } catch (e) {
    Toast.error(`创建失败: ${e}`);
  }
};

const showGlossaryModal = ref(false);
const activeGlossaryId = ref<string | null>(null);
const activeGlossaryName = ref<string>('');
const glossary = ref<Glossary>({});
const termsToAdd = ref<[string, string]>(['', '']);
const deletedTerms = ref<[string, string][]>([]);
const importGlossaryRaw = ref('');

const lastDeletedTerm = computed(() => {
  const last = deletedTerms.value[deletedTerms.value.length - 1];
  if (last === undefined) return undefined;
  return `${last[0]} => ${last[1]}`;
});

const isReadOnly = ref(false);

const openEditor = (item: ThemeGlossaryDto, readonly = false) => {
  activeGlossaryId.value = item.id;
  activeGlossaryName.value = item.name;
  glossary.value = { ...item.glossary };
  deletedTerms.value = [];
  termsToAdd.value = ['', ''];
  isReadOnly.value = readonly;
  showGlossaryModal.value = true;
};

const deleteThemeGlossary = async (id: string, name: string) => {
  if (!confirm(`确定要删除 ${name} 吗？`)) return;
  try {
    await ThemeGlossaryApi.deleteGlossary(id);
    Toast.success('删除成功');
    await loadList();
  } catch (e) {
    Toast.error(`删除失败: ${e}`);
  }
};

const addTerm = () => {
  const [jp, zh] = termsToAdd.value;
  if (jp && zh) {
    glossary.value[jp.trim()] = zh.trim();
    termsToAdd.value = ['', ''];
  }
};

const deleteTerm = (jp: string) => {
  if (jp in glossary.value) {
    deletedTerms.value.push([jp, glossary.value[jp]]);
    delete glossary.value[jp];
  }
};

const undoDeleteTerm = () => {
  if (deletedTerms.value.length === 0) return;
  const [jp, zh] = deletedTerms.value.pop()!;
  glossary.value[jp] = zh;
};

const clearTerm = () => {
  glossary.value = {};
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

const submitGlossary = async () => {
  const id = activeGlossaryId.value;
  if (!id) return;
  try {
    await ThemeGlossaryApi.update(id, activeGlossaryName.value, glossary.value);
    Toast.success('更新成功');
    showGlossaryModal.value = false;
    await loadList();
  } catch (e) {
    Toast.error(`更新失败: ${e}`);
  }
};
</script>

<template>
  <div class="flex flex-col gap-4">
    <Bulletin>
      <p>
        共用主题术语表允许你在多个作品之间共享一套翻译术语。你可以在小说的编辑页面（或者翻译设置页面）中绑定一个共用术语表。
        <br />
        在翻译时如有冲突，会优先使用小说自带的具体术语。
      </p>
    </Bulletin>

    <div class="flex items-center gap-3">
      <span class="text-muted text-sm">操作</span>
      <UButton
        color="neutral"
        variant="outline"
        class="rounded-full"
        @click="showCreateModal = true"
      >
        添加新主题
      </UButton>
    </div>

    <table
      v-if="list.length > 0"
      class="content-table max-w-165 rounded border border-default text-sm [&>tbody>tr:nth-child(even)]:bg-surface"
    >
      <thead>
        <tr>
          <th class="w-20">操作</th>
          <th>名称</th>
          <th>词条数</th>
          <th>建立者</th>
          <th>最近一次更新</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="item in list" :key="item.id">
          <td>
            <div class="flex items-center gap-2">
              <template v-if="canEdit(item)">
                <UButton
                  color="neutral"
                  variant="link"
                  size="sm"
                  @click="openEditor(item)"
                >
                  编辑
                </UButton>
                <ActionButton
                  color="error"
                  variant="link"
                  size="sm"
                  square
                  :icon="DeleteOutlineOutlined"
                  aria-label="删除"
                  :action="() => deleteThemeGlossary(item.id, item.name)"
                />
              </template>
              <UButton
                v-else
                color="neutral"
                variant="link"
                size="sm"
                @click="openEditor(item, true)"
              >
                查看
              </UButton>
            </div>
          </td>
          <td>{{ item.name }}</td>
          <td>{{ Object.keys(item.glossary).length }}</td>
          <td>
            <UBadge
              size="sm"
              :color="
                isCurrentAuthor(whoami, item.authorUsername)
                  ? 'info'
                  : 'neutral'
              "
              variant="soft"
            >
              {{
                isCurrentAuthor(whoami, item.authorUsername) ? '我的' : '他人'
              }}
            </UBadge>
          </td>
          <td>{{ new Date(item.updateAt).toLocaleString() }}</td>
        </tr>
      </tbody>
    </table>
    <CEmpty v-else title="暂无共用主题术语表" />
  </div>

  <UModal title="新建共用术语表" v-model:open="showCreateModal">
    <template #body>
      <UInput
        class="w-full"
        v-model="newName"
        placeholder="请输入主题名称（例如：刀剑神域）"
        @keyup.enter="createThemeGlossary"
      />
    </template>
    <template #footer>
      <ActionButton
        color="primary"
        variant="solid"
        :action="createThemeGlossary"
      >
        创建
      </ActionButton>
    </template>
  </UModal>

  <UModal
    :title="`${isReadOnly ? '正在查看' : '正在编辑'}：${activeGlossaryName}`"
    v-model:open="showGlossaryModal"
    :ui="{ content: 'w-150 max-w-[calc(100vw-2rem)]' }"
    :content="{ onOpenAutoFocus: (event: Event) => event.preventDefault() }"
  >
    <template #body>
      <div class="mb-4 flex max-w-100 flex-col gap-3">
        <UInput
          v-model="activeGlossaryName"
          size="sm"
          placeholder="主题名称"
          :readonly="isReadOnly"
          class="w-full"
        />
        <UFieldGroup v-if="!isReadOnly" size="sm" class="w-full">
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
          v-if="!isReadOnly"
          v-model="importGlossaryRaw"
          size="sm"
          placeholder="批量导入术语表"
          :spellcheck="false"
          :rows="1"
          class="w-full"
        />
        <div class="flex items-center gap-3">
          <ActionButton size="sm" :action="exportGlossary">导出</ActionButton>
          <template v-if="!isReadOnly">
            <ActionButton size="sm" :action="importGlossary">导入</ActionButton>
            <UButton color="error" variant="soft" size="sm" @click="clearTerm">
              清空
            </UButton>
          </template>
        </div>
        <div v-if="!isReadOnly" class="flex items-center gap-3">
          <UButton
            color="neutral"
            variant="outline"
            size="sm"
            :disabled="deletedTerms.length === 0"
            @click="undoDeleteTerm"
          >
            撤销删除
          </UButton>
          <span v-if="lastDeletedTerm !== undefined" class="text-muted text-xs">
            {{ lastDeletedTerm }}
          </span>
        </div>
      </div>
      <UScrollArea class="max-h-100">
        <table
          v-if="Object.keys(glossary).length !== 0"
          class="content-table max-w-100 rounded border border-default text-xs [&>tbody>tr:nth-child(even)]:bg-surface"
        >
          <tbody>
            <tr v-for="wordJp in Object.keys(glossary).reverse()" :key="wordJp">
              <td v-if="!isReadOnly">
                <ActionButton
                  color="error"
                  variant="link"
                  size="sm"
                  square
                  :icon="DeleteOutlineOutlined"
                  aria-label="删除"
                  :action="() => deleteTerm(wordJp)"
                />
              </td>
              <td>{{ wordJp }}</td>
              <td class="whitespace-nowrap">=&gt;</td>
              <td class="pr-4!">
                <UInput
                  v-model="glossary[wordJp]"
                  size="xs"
                  placeholder="请输入中文翻译"
                  variant="none"
                  :readonly="isReadOnly"
                  class="w-full"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </UScrollArea>
    </template>
    <template #footer>
      <ActionButton
        v-if="!isReadOnly"
        color="primary"
        variant="solid"
        :action="submitGlossary"
      >
        保存提交
      </ActionButton>
    </template>
  </UModal>
</template>
