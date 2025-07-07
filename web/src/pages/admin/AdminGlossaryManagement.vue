<script lang="ts" setup>
import { TagGlossaryRepository } from '@/data/api';
import type { TagGlossary } from '@/data/api/TagGlossaryRepository';
import { Result, runCatching } from '@/util/result';
import { Glossary } from '@/model/Glossary';
import { useMessage } from 'naive-ui';

const glossariesResult = ref<Result<TagGlossary[]>>();
const message = useMessage();

const load = async () => {
  glossariesResult.value = await runCatching(TagGlossaryRepository.list());
};

onMounted(load);

const showEdit = ref(false);
const editItem = ref<TagGlossary>();
const editRaw = ref('');
const editAdminOnly = ref(false);

const openEdit = (item: TagGlossary) => {
  editItem.value = item;
  editRaw.value = Glossary.toText(item.glossary);
  editAdminOnly.value = item.adminOnly;
  showEdit.value = true;
};

const submitEdit = async () => {
  if (!editItem.value) return;
  const g = Glossary.fromText(editRaw.value);
  if (!g) {
    message.error('术语表格式错误');
    return;
  }
  await TagGlossaryRepository.update(editItem.value.id, {
    glossary: g,
    adminOnly: editAdminOnly.value,
  });
  editItem.value.glossary = g;
  editItem.value.adminOnly = editAdminOnly.value;
  showEdit.value = false;
};

const newTag = ref('');
const newRaw = ref('');
const newAdminOnly = ref(false);

const create = async () => {
  const g = Glossary.fromText(newRaw.value);
  if (!g) {
    message.error('术语表格式错误');
    return;
  }
  await TagGlossaryRepository.create({
    tag: newTag.value,
    glossary: g,
    adminOnly: newAdminOnly.value,
  });
  newTag.value = '';
  newRaw.value = '';
  newAdminOnly.value = false;
  await load();
};

const remove = async (id: string) => {
  await TagGlossaryRepository.remove(id);
  const result = glossariesResult.value;
  if (result && result.ok) {
    result.value = result.value.filter((it) => it.id !== id);
  }
};
</script>

<template>
  <n-button type="primary" @click="load">刷新</n-button>
  <n-divider />
  <c-result
    :result="glossariesResult"
    :show-empty="(items: TagGlossary[]) => items.length === 0"
    v-slot="{ value }"
  >
    <n-table :bordered="false">
      <thead>
        <tr>
          <th>tag</th>
          <th>adminOnly</th>
          <th>terms</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="g in value" :key="g.id">
          <td>{{ g.tag }}</td>
          <td>{{ g.adminOnly }}</td>
          <td>{{ Object.keys(g.glossary).length }}</td>
          <td>
            <n-button size="small" @click="openEdit(g)">编辑</n-button>
            <n-button size="small" type="error" @click="remove(g.id)">
              删除
            </n-button>
          </td>
        </tr>
      </tbody>
    </n-table>
  </c-result>

  <n-modal v-model:show="showEdit" preset="dialog" title="编辑术语表">
    <n-input v-model:value="editRaw" type="textarea" :rows="5" />
    <n-checkbox v-model:checked="editAdminOnly">仅管理员可改</n-checkbox>
    <template #action>
      <n-button type="primary" @click="submitEdit">提交</n-button>
    </template>
  </n-modal>

  <n-divider />
  <n-h3>新建术语表</n-h3>
  <n-form-item label="Tag"><n-input v-model:value="newTag" /></n-form-item>
  <n-form-item label="内容">
    <n-input v-model:value="newRaw" type="textarea" :rows="3" />
  </n-form-item>
  <n-form-item label="仅管理员可改">
    <n-checkbox v-model:checked="newAdminOnly" />
  </n-form-item>
  <n-button type="primary" @click="create">创建</n-button>
</template>
