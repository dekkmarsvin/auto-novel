<script lang="ts" setup>
import { onMounted, ref } from 'vue';
import { useMessage } from 'naive-ui';
import { DeleteOutlineOutlined } from '@vicons/material';

import { ThemeGlossaryApi } from '@/api/novel/ThemeGlossaryApi';
import type { ThemeGlossaryDto } from '@/model/ThemeGlossary';
import { Glossary } from '@/model/Glossary';
import { copyToClipBoard } from '@/pages/util';
import { useWhoamiStore } from '@/stores';

const message = useMessage();
const list = ref<ThemeGlossaryDto[]>([]);

const whoamiStore = useWhoamiStore();
const { whoami } = storeToRefs(whoamiStore);

const canEdit = (item: ThemeGlossaryDto) =>
  whoami.value.isAdmin || whoami.value.isMe(item.authorUsername);

const loadList = async () => {
  try {
    list.value = await ThemeGlossaryApi.list();
  } catch (e) {
    message.error(`载入失败: ${e}`);
  }
};

onMounted(loadList);

const showCreateModal = ref(false);
const newName = ref('');

const createThemeGlossary = async () => {
  if (!newName.value) {
    message.warning('请输入名称');
    return;
  }
  try {
    await ThemeGlossaryApi.create(newName.value, {});
    message.success('创建成功');
    showCreateModal.value = false;
    newName.value = '';
    await loadList();
  } catch (e) {
    message.error(`创建失败: ${e}`);
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

const openEditor = (item: ThemeGlossaryDto) => {
  activeGlossaryId.value = item.id;
  activeGlossaryName.value = item.name;
  glossary.value = { ...item.glossary };
  deletedTerms.value = [];
  termsToAdd.value = ['', ''];
  showGlossaryModal.value = true;
};

const deleteThemeGlossary = async (id: string, name: string) => {
  if (!confirm(`确定要删除 ${name} 吗？`)) return;
  try {
    await ThemeGlossaryApi.deleteGlossary(id);
    message.success('删除成功');
    await loadList();
  } catch (e) {
    message.error(`删除失败: ${e}`);
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

const exportGlossary = async (ev: MouseEvent) => {
  const isSuccess = await copyToClipBoard(
    Glossary.toText(glossary.value),
    ev.target as HTMLElement,
  );
  if (isSuccess) {
    message.success('导出成功：已复制到剪贴板');
  } else {
    message.success('导出失败');
  }
};

const importGlossary = () => {
  const importedGlossary = Glossary.fromText(importGlossaryRaw.value);
  if (importedGlossary === undefined) {
    message.error('导入失败：术语表格式不正确');
  } else {
    message.success('导入成功');
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
    message.success('更新成功');
    showGlossaryModal.value = false;
    await loadList();
  } catch (e) {
    message.error(`更新失败: ${e}`);
  }
};
</script>

<template>
  <n-flex vertical size="large">
    <bulletin>
      <n-p>
        共用主题术语表允许你在多个作品之间共享一套翻译术语。
        你可以在小说的编辑页面（或者翻译设置页面）中绑定一个共用术语表。
        <br />
        在翻译时如有冲突，会优先使用小说自带的具体术语。
      </n-p>
    </bulletin>

    <c-action-wrapper title="操作">
      <c-button label="添加新主题" @action="showCreateModal = true" />
    </c-action-wrapper>

    <n-table
      v-if="list.length > 0"
      striped
      size="small"
      style="max-width: 660px"
    >
      <thead>
        <tr>
          <th style="width: 80px">操作</th>
          <th>名称</th>
          <th>词条数</th>
          <th>建立者</th>
          <th>最近一次更新</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="item in list" :key="item.id">
          <td>
            <n-flex :wrap="false" size="small">
              <template v-if="canEdit(item)">
                <c-button text label="编辑" @action="openEditor(item)" />
                <c-icon-button
                  tooltip="删除"
                  :icon="DeleteOutlineOutlined"
                  type="error"
                  text
                  @action="deleteThemeGlossary(item.id, item.name)"
                />
              </template>
              <n-text v-else depth="3" style="font-size: 12px">唯读</n-text>
            </n-flex>
          </td>
          <td>{{ item.name }}</td>
          <td>{{ Object.keys(item.glossary).length }}</td>
          <td>
            <n-tag
              size="small"
              :type="whoami.isMe(item.authorUsername) ? 'info' : 'default'"
            >
              {{ whoami.isMe(item.authorUsername) ? '我的' : '他人' }}
            </n-tag>
          </td>
          <td><n-time :time="item.updateAt" type="datetime" /></td>
        </tr>
      </tbody>
    </n-table>
    <n-empty v-else description="暂无共用主题术语表" />
  </n-flex>

  <c-modal title="新建共用术语表" v-model:show="showCreateModal">
    <n-input
      v-model:value="newName"
      placeholder="请输入主题名称（例如：刀剑神域）"
      @keyup.enter="createThemeGlossary"
    />
    <template #action>
      <c-button label="创建" type="primary" @action="createThemeGlossary" />
    </template>
  </c-modal>

  <c-modal
    :title="`正在编辑：${activeGlossaryName}`"
    v-model:show="showGlossaryModal"
    :extra-height="120"
  >
    <template #header-extra>
      <n-flex
        vertical
        size="large"
        style="max-width: 400px; margin-bottom: 16px"
      >
        <n-input-group>
          <n-input
            v-model:value="activeGlossaryName"
            size="small"
            placeholder="主题名称"
          />
        </n-input-group>

        <n-input-group>
          <n-input
            pair
            v-model:value="termsToAdd"
            size="small"
            separator="=>"
            :placeholder="['日文', '中文']"
            :input-props="{ spellcheck: false }"
          />
          <c-button
            label="添加"
            :round="false"
            size="small"
            @action="addTerm"
          />
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
    </template>

    <n-table
      v-if="Object.keys(glossary).length !== 0"
      striped
      size="small"
      style="font-size: 12px; max-width: 400px"
    >
      <tr v-for="wordJp in Object.keys(glossary).reverse()" :key="wordJp">
        <td>
          <c-button
            :icon="DeleteOutlineOutlined"
            text
            type="error"
            size="small"
            @action="deleteTerm(wordJp)"
          />
        </td>
        <td>{{ wordJp }}</td>
        <td nowrap="nowrap">=></td>
        <td style="padding-right: 16px">
          <n-input
            :value="glossary[wordJp]"
            @update:value="(v) => (glossary[wordJp] = v || '')"
            size="tiny"
            placeholder="请输入中文翻译"
            :theme-overrides="{ border: '0', color: 'transprent' }"
          />
        </td>
      </tr>
    </n-table>

    <template #action>
      <c-button label="保存提交" type="primary" @action="submitGlossary" />
    </template>
  </c-modal>
</template>
