import { computed, onScopeDispose, ref, watch } from 'vue';

export function useNailainPasswordDraft(
  identity: () => string | null,
  api: {
    getNailainPassword(): Promise<string>;
    setNailainPassword(value: string): Promise<unknown>;
  },
  notify: (kind: 'success' | 'error', text: string) => void,
) {
  const password = ref('');
  const loading = ref(false);
  const saving = ref(false);
  const ready = ref(false);
  const dirty = ref(false);
  let generation = 0;
  let revision = 0;
  const clear = () => {
    generation++;
    revision++;
    password.value = '';
    dirty.value = ready.value = loading.value = saving.value = false;
  };
  const edit = (value: string) => {
    if (!identity()) return;
    revision++;
    dirty.value = true;
    password.value = value;
  };
  watch(
    identity,
    async (owner) => {
      clear();
      if (!owner) return;
      const request = generation;
      const initialRevision = revision;
      loading.value = true;
      try {
        const value = await api.getNailainPassword();
        if (request !== generation || owner !== identity()) return;
        if (revision === initialRevision) password.value = value;
        ready.value = true;
      } catch {
        if (request === generation && owner === identity())
          notify('error', '读取合言葉失败，请重新进入设置页');
      } finally {
        if (request === generation) loading.value = false;
      }
    },
    { immediate: true, flush: 'sync' },
  );
  const canSave = computed(
    () =>
      !!identity() &&
      ready.value &&
      dirty.value &&
      !loading.value &&
      !saving.value,
  );
  const save = async () => {
    if (!canSave.value) return;
    const request = generation;
    const owner = identity();
    const savedRevision = revision;
    saving.value = true;
    try {
      await api.setNailainPassword(password.value);
      if (request !== generation || owner !== identity()) return;
      if (revision === savedRevision) {
        password.value = '';
        dirty.value = false;
      }
      notify('success', '合言葉已保存，下次源站登录时生效');
    } catch {
      if (request === generation && owner === identity())
        notify('error', '保存合言葉失败');
    } finally {
      if (request === generation) saving.value = false;
    }
  };
  onScopeDispose(clear);
  return { password, loading, saving, canSave, edit, save };
}
