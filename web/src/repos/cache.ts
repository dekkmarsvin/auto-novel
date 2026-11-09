import { useQueryCache } from '@pinia/colada';

/** Static route imports run before main installs Pinia; resolve only on use. */
export const getQueryCache = () => useQueryCache();

export function withOnSuccess<TArgs extends unknown[], TReturn>(
  apiCall: (...args: TArgs) => Promise<TReturn>,
  onSuccess: (ret: TReturn, ...args: TArgs) => void,
) {
  return (...args: TArgs) =>
    apiCall(...args).then((ret) => {
      onSuccess(ret, ...args);
      return ret;
    });
}
