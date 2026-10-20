import { useElementSize } from '@vueuse/core';

import type { Banner } from '@/api';
import { BannerRepo, objectPosition, type BannerSelection } from '@/repos';

const FallbackImage = '/files-extra/banner.v1.webp';

/** 首页横幅：首屏图片、焦点裁剪、兜底切换与定时轮换。 */
export function useBannerImage() {
  // 首屏同步出图：命中缓存则直接用缓存横幅，否则用兜底图，避免先闪一次占位色块。
  const initial = BannerRepo.peek();
  const banner = ref<Banner | undefined>(initial?.banner);
  const imageUrl = ref(initial?.banner.imageUrl || FallbackImage);
  const container = ref<HTMLElement>();
  const { width, height } = useElementSize(container);
  const imageSize = ref({ width: 0, height: 0 });
  const loading = ref(true);
  const switching = ref(false);
  const canSwitch = ref(false);
  const switchError = ref('');

  const imagePosition = computed(() => {
    // 无横幅数据时沿用旧版 bg-top 的对齐方式。
    if (!banner.value) return '50% 0%';
    return objectPosition(
      imageSize.value,
      { width: width.value, height: height.value },
      { x: banner.value.focalX, y: banner.value.focalY },
    );
  });

  const imageLoaded = (event: Event) => {
    const image = event.target as HTMLImageElement;
    imageSize.value = {
      width: image.naturalWidth,
      height: image.naturalHeight,
    };
    loading.value = false;
  };

  const useFallback = () => {
    banner.value = undefined;
    // API 无数据不代表兜底图片失败；保留已经加载或正在加载的旧图。
    if (imageUrl.value === FallbackImage) return;
    loading.value = true;
    imageSize.value = { width: 0, height: 0 };
    imageUrl.value = FallbackImage;
  };

  const showFallback = () => {
    if (imageUrl.value === FallbackImage) {
      // 只有图片自己的 error 事件才能判定兜底图不可用。
      imageUrl.value = '';
      loading.value = false;
      return;
    }
    useFallback();
  };

  let rotationTimer: ReturnType<typeof setTimeout> | undefined;
  let cancelPreload: (() => void) | undefined;
  let disposed = false;
  const loadBanner = async (next = false) => {
    if (switching.value || disposed) return;
    switching.value = true;
    switchError.value = '';
    clearTimeout(rotationTimer);
    let selected: BannerSelection | undefined = next
      ? BannerRepo.peek()
      : undefined;
    try {
      const candidate = await BannerRepo.current(next, { persist: !next });
      if (disposed) return;
      canSwitch.value = (await BannerRepo.list()).length > 1;
      if (disposed) return;
      if (!candidate?.banner.imageUrl) {
        if (!next) useFallback();
        return;
      }

      // 手动切换先预加载，失败时不清空当前背景。
      if (next && imageUrl.value !== candidate.banner.imageUrl) {
        const image = new Image();
        const url = candidate.banner.imageUrl;
        await new Promise<void>((resolve, reject) => {
          const finish = (error?: Error) => {
            clearTimeout(timeout);
            cancelPreload = undefined;
            image.onload = null;
            image.onerror = null;
            if (error) {
              image.src = '';
              reject(error);
            } else resolve();
          };
          const timeout = setTimeout(
            () => finish(new Error('图片加载超时')),
            15000,
          );
          image.onload = () => finish();
          image.onerror = () => finish(new Error('图片加载失败'));
          cancelPreload = () => {
            finish(new DOMException('页面已关闭', 'AbortError'));
          };
          image.src = url;
        });
        if (disposed) return;
        imageSize.value = {
          width: image.naturalWidth,
          height: image.naturalHeight,
        };
      }
      if (next) BannerRepo.remember(candidate);
      selected = candidate;
      banner.value = selected.banner;
      if (imageUrl.value !== selected.banner.imageUrl) {
        loading.value = !next;
        if (!next) imageSize.value = { width: 0, height: 0 };
        imageUrl.value = selected.banner.imageUrl;
      }
    } catch {
      if (disposed) return;
      if (next) switchError.value = '切换失败，点击重试';
      else useFallback();
    } finally {
      switching.value = false;
      if (!disposed && selected) {
        rotationTimer = setTimeout(
          () => void loadBanner(),
          Math.max(0, selected.expiresAt - Date.now()),
        );
      }
    }
  };
  const nextBanner = () => loadBanner(true);
  onMounted(() => void loadBanner());
  onBeforeUnmount(() => {
    disposed = true;
    clearTimeout(rotationTimer);
    cancelPreload?.();
  });

  return {
    container,
    imageUrl,
    imagePosition,
    loading,
    switching,
    canSwitch,
    switchError,
    nextBanner,
    imageLoaded,
    showFallback,
  };
}
