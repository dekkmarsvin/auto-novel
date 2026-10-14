/** Keep the inactive service out of startup, including empty-URL validation. */
export function lazyCommunityApi<T extends object>(
  configuration: { enabled: boolean; url: string },
  create: () => T,
): T {
  let api: T | undefined;
  return new Proxy({} as T, {
    get(_target, key) {
      if (!configuration.enabled || !configuration.url) {
        throw new Error('本站未启用社区服务');
      }
      api ??= create();
      return Reflect.get(api, key);
    },
  });
}
