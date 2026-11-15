<script lang="ts" setup>
import { Toast, useWebKit, XPage } from '@novelia/web-kit';
import { SiteSettingApi } from '@/api';
import { community } from '@/config';
import SoundAllTaskCompleted from '@/sound/all_task_completed.mp3';
import {
  Setting,
  useSettingStore,
  useWebSearchHistoryStore,
  useWenkuSearchHistoryStore,
  useWhoamiStore,
} from '@/stores';
import { useNailainPasswordDraft } from './nailainPasswordDraft';
import { InfoOutlined } from '@vicons/material';

const settingStore = useSettingStore();
const { setting } = storeToRefs(settingStore);

const clearWebSearchHistory = () => {
  useWebSearchHistoryStore().clear();
  Toast.success('清空成功');
};

const clearWenkuSearchHistory = () => {
  useWenkuSearchHistoryStore().clear();
  Toast.success('清空成功');
};

const playSound = (source: string) => {
  return new Audio(source).play();
};
const { theme } = useWebKit();

const { whoami } = storeToRefs(useWhoamiStore());

const nailainDraft = useNailainPasswordDraft(
  () =>
    whoami.value.isAdmin
      ? `${whoami.value.user?.id}:${whoami.value.user?.username}`
      : null,
  SiteSettingApi,
  (kind, text) => Toast[kind](text),
);
const {
  password: nailainPassword,
  loading: nailainLoading,
  saving: nailainSaving,
  canSave: nailainCanSave,
} = nailainDraft;
const saveNailainPassword = nailainDraft.save;
</script>

<template>
  <XPage>
    <UPageHeader title="设置" />

    <div
      class="divide-y divide-default leading-[1.6] text-default text-sm rounded-[3px] border border-default"
    >
      <div class="relative min-w-0 py-3 px-5">
        <div class="flex flex-col gap-y-2">
          <b>主题</b>
          <c-radio-group
            :value="theme.preference.value"
            @update:value="theme.setPreference($event)"
            :options="Setting.themeOptions"
            size="small"
          />
        </div>
      </div>

      <div class="relative min-w-0 py-3 px-5">
        <div class="flex flex-col gap-y-2">
          <b>快捷键说明</b>
          <ul class="content-list">
            <li>列表页面，可以使用左右方向键翻页。</li>
            <li>
              GPT/Sakura排队按钮，按住 Ctrl（macOS 为
              Cmd）键点击，会将任务自动置顶。
            </li>
            <li>
              小说/文库页面，可以用数字键切换底部分页，也可在分页区域内单指左右滑动切换。
            </li>
            <li>阅读页面，可以使用左右方向键跳转上/下一章。</li>
            <li>阅读页面，可以使用数字键1～3快速切换翻译。</li>
          </ul>
        </div>
      </div>

      <div class="relative min-w-0 py-3 px-5">
        <div class="flex flex-col gap-y-2">
          <b>网络小说目录</b>
          <UCheckbox
            v-model="setting.tocCollapseInNarrowScreen"
            label="目录折叠在侧边栏 (移动端)"
          />
          <div class="flex items-center gap-1">
            <UCheckbox
              v-model="setting.tocExpandAll"
              label="目录默认展开所有章节"
            />
            <UTooltip :ui="{ content: 'max-w-100' }">
              <UButton
                :icon="InfoOutlined"
                :ui="{ leadingIcon: 'size-3 shrink-0 opacity-60' }"
                color="neutral"
                variant="link"
                class="p-0"
                aria-label="目录展开说明"
                @click.stop
              />

              <template #content>
                开启：默认展开所有章节（可能导致性能问题）
                <br />
                关闭：只展开上次阅读的章节（如无记录则展开第一个章节）
                <br />
                不影响无分章的网络小说
              </template>
            </UTooltip>
          </div>
          <b v-if="community.enabled">评论</b>
          <UCheckbox
            v-if="community.enabled"
            v-model="setting.hideCommmentWebNovel"
            label="隐藏网络小说评论"
          />
          <UCheckbox
            v-if="community.enabled"
            v-model="setting.hideCommmentWenkuNovel"
            label="隐藏文库小说评论"
          />
          <b>收藏夹</b>
          <UCheckbox
            v-model="setting.showTagInWebFavored"
            label="显示收藏夹里网络小说的标签"
          />
          <UCheckbox
            v-model="setting.favoriteCreateTimeFirst"
            label="收藏时间排序优先"
          />
        </div>
      </div>

      <div class="relative min-w-0 py-3 px-5">
        <div class="flex flex-col gap-y-2">
          <b>工作区</b>
          <UCheckbox
            v-model="setting.autoTopJobWhenAddTask"
            label="工作区添加时自动置顶"
          />
        </div>
      </div>

      <div class="relative min-w-0 py-3 px-5">
        <div class="flex flex-col gap-y-2">
          <b>列表分页方式</b>
          <c-radio-group
            v-model:value="setting.paginationMode"
            :options="Setting.paginationModeOptions"
            size="small"
          />
        </div>
      </div>

      <div class="relative min-w-0 py-3 px-5">
        <div class="flex flex-col gap-y-2">
          <b>显示的翻译按钮</b>
          <translator-check
            v-model:value="setting.enabledTranslator"
            size="sm"
            class="self-start"
          />
        </div>
      </div>

      <div class="relative min-w-0 py-3 px-5">
        <div class="flex flex-col gap-y-2">
          <b>工作区语音提醒</b>
          <div class="flex">
            <UCheckbox v-model="setting.workspaceSound" label="任务全部完成" />

            [
            <ActionButton
              color="primary"
              variant="link"
              class="p-0 leading-none"
              :action="() => playSound(SoundAllTaskCompleted)"
            >
              点击播放
            </ActionButton>
            ]
          </div>
        </div>
      </div>

      <div class="relative min-w-0 py-3 px-5">
        <div class="flex flex-col items-start gap-y-2">
          <b>清空搜索历史</b>
          <div class="flex flex-wrap gap-x-3 gap-y-2">
            <UButton
              color="neutral"
              variant="outline"
              size="sm"
              class="rounded-full text-sm/4"
              @click="clearWebSearchHistory"
            >
              清空网络搜索历史
            </UButton>
            <UButton
              color="neutral"
              variant="outline"
              size="sm"
              class="rounded-full text-sm/4"
              @click="clearWenkuSearchHistory"
            >
              清空文库搜索历史
            </UButton>
          </div>
        </div>
      </div>

      <div class="relative min-w-0 py-3 px-5">
        <div class="flex flex-col gap-y-2">
          <b>语言</b>
          简繁转换目前只覆盖web章节内容。
          <c-radio-group
            v-model:value="setting.locale"
            :options="Setting.localeOptions"
            size="small"
          />
          <UCheckbox
            v-model="setting.searchLocaleAware"
            label="支持繁体搜索（不稳定）"
          />
        </div>
      </div>
      <div v-if="whoami.isAdmin" class="relative min-w-0 py-3 px-5">
        <div class="flex flex-col gap-y-2">
          <b>NAILAIN ARCHIVE 合言葉（管理员）</b>
          源站合言葉每月轮换。保存后仅在下次源站登录时读取新值，已有登录会话不会立即撤销。清空保存会回退到服务器
          NAILAIN_PASSWORD；两者均为空时无法重新登录。
          <div class="flex gap-2">
            <UInput
              :model-value="nailainPassword"
              @update:model-value="nailainDraft.edit"
              type="password"
              :disabled="nailainSaving"
              placeholder="本月合言葉"
              autocomplete="off"
              class="flex-1"
            />
            <ActionButton
              :disabled="!nailainCanSave"
              :loading="nailainLoading || nailainSaving"
              :action="saveNailainPassword"
            >
              保存
            </ActionButton>
          </div>
        </div>
      </div>
    </div>
  </XPage>
</template>
