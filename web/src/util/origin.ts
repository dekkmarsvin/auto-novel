const DEFAULT_ORIGIN = 'https://books.kotoban.top';

const resolveOrigin = (value?: string) => {
  if (!value) return DEFAULT_ORIGIN;
  try {
    return new URL(value).origin;
  } catch (_error) {
    return DEFAULT_ORIGIN;
  }
};

const resolvedOrigin = resolveOrigin(import.meta.env.VITE_ORIGIN_DOMAIN);
const resolvedHostname = new URL(resolvedOrigin).hostname;
const resolvedBaseDomain = resolvedHostname.split('.').slice(-2).join('.');

const hasWindow = typeof window !== 'undefined';
const legacyHostPatterns = [/fishhawk\.top$/i];

export const officialOrigin = resolvedOrigin;
export const officialHostname = resolvedHostname;
export const officialBaseDomain = resolvedBaseDomain;
export const isOfficialOrigin = hasWindow
  ? window.location.origin === officialOrigin
  : false;
export const isLegacyHost = hasWindow
  ? legacyHostPatterns.some((pattern) => pattern.test(window.location.hostname))
  : false;

export const getOfficialAssetUrl = (path: string) => {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${officialOrigin}${normalizedPath}`;
};

export const shouldUseNewStorageKeys = isOfficialOrigin;
