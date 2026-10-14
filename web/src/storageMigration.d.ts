export function migrateLegacyStorage(
  storage: {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
  },
  now?: number,
): void;
