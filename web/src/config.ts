/** Deployment capability; user hide-comment preferences cannot enable it. */
export const authProductionUrl = 'https://auth.kotoban.top/';
export const community = {
  enabled: false,
  url: '',
  guides: { usage: '', glossary: '', sakuraDeploy: '', sakuraDownload: '' },
} as const;

export const commentsAvailable = (hideComment: boolean) =>
  community.enabled && !hideComment;
