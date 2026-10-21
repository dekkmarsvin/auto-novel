/** Deployment capability; user hide-comment preferences cannot enable it. */
export const authProductionUrl = 'https://auth.kotoban.top/';
export const community = {
  enabled: false,
  url: '',
  guides: { usage: '', glossary: '', sakuraDeploy: '', sakuraDownload: '' },
} as const;

export const commentsAvailable = (hideComment: boolean) =>
  community.enabled && !hideComment;

// 本站社区及项目相关的外部链接。
export const siteUrls = {
  repository: `https://github.com/${__BUILD_INFO__.gitRepository}`,
  addonRepository: 'https://github.com/auto-novel/Addon',
  qqGroup:
    'http://qm.qq.com/cgi-bin/qm/qr?_wv=1027&k=Qa0SOMBYZoJZ4vuykz3MbPS0zbpeN0pW&authKey=q75E7fr5CIBSDhqX%2F4kuC%2B0mcPiDvj%2FSDfP%2FGZ8Rl8kDn6Z3M6XPSZ91yt4ZWonq&noverify=0&group_code=819513328',
  telegram: 'https://t.me/+hgUSCmuBReQzNmU1',
  sakuraMonitor:
    'https://monitor.novelia.cc/public-dashboards/be71c46fcc0e40eeaf06d9e7a2e26f95?refresh=auto&from=now-5m&to=now&timezone=browser',
} as const;

export const externalImageUrls = {
  wenkuCoverPlaceholder: new URL(
    './image/cover_placeholder.png',
    import.meta.url,
  ).href,
} as const;
