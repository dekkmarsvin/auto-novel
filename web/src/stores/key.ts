<<<<<<< HEAD
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
=======
export const LSKey = {
>>>>>>> upstream/main
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
<<<<<<< HEAD

export const LSKey =
  shouldUseNewStorageKeys ? LSKeyNew : LSKeyLegacy;

=======
>>>>>>> upstream/main
