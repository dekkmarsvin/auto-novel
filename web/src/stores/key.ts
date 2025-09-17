import { shouldUseNewStorageKeys } from '@/util/origin';

const LSKeyLegacy = {
  Auth: 'authInfo',
  Blacklist: 'blockComment',
  Draft: 'draft',
  Favored: 'favored',
  ReadPosition: 'readPosition',
  Notified: 'readState',
  SearchHistoryWeb: 'webSearchHistory',
  SearchHistoryWenku: 'wenkuSearchHistory',
  Setting: 'setting',
  SettingReader: 'readerSetting',
  WorkspaceGpt: 'gpt-worker',
  WorkspaceSakura: 'sakura-workspace',
} as const;

const LSKeyNew = {
  Auth: 'auth',
  Blacklist: 'blacklist',
  Draft: 'draft',
  Favored: 'favored',
  ReadPosition: 'read-position',
  Notified: 'notified',
  SearchHistoryWeb: 'search-history-web',
  SearchHistoryWenku: 'search-history-wenku',
  Setting: 'setting',
  SettingReader: 'setting-reader',
  WorkspaceGpt: 'workspace-gpt',
  WorkspaceSakura: 'workspace-sakura',
} as const;

export const LSKey =
  shouldUseNewStorageKeys ? LSKeyNew : LSKeyLegacy;

