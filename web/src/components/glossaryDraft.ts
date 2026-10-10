import { onScopeDispose, ref, toRaw, watch } from 'vue';

import { WebNovelApi } from '../api/novel/WebNovelApi';
import { WenkuNovelApi } from '../api/novel/WenkuNovelApi';
import type { GenericNovelId } from '../model/Common';
import type { Glossary } from '../model/Glossary';

export interface GlossaryDraft {
  glossary: Glossary;
  themeGlossaryId?: string;
}

/** Keep the selected shared glossary when only the novel's terms are edited. */
export function useGlossaryDraft(
  source: () => GlossaryDraft,
  identity: () => string | undefined = () => undefined,
) {
  const glossary = ref<Glossary>({});
  const themeGlossaryId = ref<string | null>(null);
  let original: GlossaryDraft | undefined;
  let currentIdentity: string | undefined;
  let generation = 0;
  let active = true;

  const snapshot = (): GlossaryDraft => ({
    glossary: { ...toRaw(glossary.value) },
    themeGlossaryId: themeGlossaryId.value || undefined,
  });

  const resetState = () => {
    const value = source();
    glossary.value = { ...value.glossary };
    themeGlossaryId.value = value.themeGlossaryId || null;
    original = snapshot();
  };

  const isGlossaryChanged = () => {
    const saved = original;
    if (!saved) return false;
    const current = snapshot();
    if (current.themeGlossaryId !== saved.themeGlossaryId) return true;
    const keys = Object.keys(current.glossary);
    return (
      keys.length !== Object.keys(saved.glossary).length ||
      keys.some((key) => current.glossary[key] !== saved.glossary[key])
    );
  };

  const markSaved = (value: GlossaryDraft) => {
    original = { ...value, glossary: { ...value.glossary } };
  };

  const submit = async (
    persist: (value: GlossaryDraft) => Promise<unknown>,
    onSaved: (value: GlossaryDraft) => void,
  ) => {
    const submitted = snapshot();
    const targetGeneration = generation;
    const targetIdentity = identity();
    await persist(submitted);
    if (
      !active ||
      generation !== targetGeneration ||
      identity() !== targetIdentity
    ) {
      return;
    }
    // Only this snapshot was saved; edits made while it was pending stay dirty.
    markSaved(submitted);
    onSaved(submitted);
  };

  watch(
    [source, identity],
    ([, key]) => {
      if (!original || key !== currentIdentity) {
        currentIdentity = key;
        generation++;
        resetState();
      } else if (!isGlossaryChanged()) {
        resetState();
      }
    },
    { deep: true, immediate: true },
  );
  onScopeDispose(() => {
    active = false;
  });

  return {
    glossary,
    themeGlossaryId,
    snapshot,
    resetState,
    isGlossaryChanged,
    markSaved,
    submit,
  };
}

export async function saveGlossaryDraft(
  gnid: GenericNovelId,
  draft: GlossaryDraft,
  updateLocal: (volumeId: string, glossary: Glossary) => Promise<unknown>,
) {
  if (gnid.type === 'web') {
    await WebNovelApi.updateGlossary(gnid.providerId, gnid.novelId, draft);
  } else if (gnid.type === 'wenku') {
    await WenkuNovelApi.updateGlossary(gnid.novelId, draft);
  } else {
    await updateLocal(gnid.volumeId, draft.glossary);
  }
}
