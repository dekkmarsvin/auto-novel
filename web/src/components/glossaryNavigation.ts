import { onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router';

/** Parameter changes reuse a route record even when its keyed editor remounts. */
export function useGlossaryNavigationGuard(
  confirmLeave: () => boolean | Promise<boolean>,
) {
  onBeforeRouteLeave(() => confirmLeave());
  onBeforeRouteUpdate((to, from) => {
    if (
      to.params.providerId !== from.params.providerId ||
      to.params.novelId !== from.params.novelId
    ) {
      return confirmLeave();
    }
    return true;
  });
}
