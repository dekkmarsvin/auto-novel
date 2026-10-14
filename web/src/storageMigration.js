/** Self-contained so the same migration can run before the theme bootstrap. */
export function migrateLegacyStorage(storage, now = Date.now()) {
  try {
    const marker = 'auto-novel:web-kit-migration:v1';
    if (storage.getItem(marker) !== null) return;
    storage.setItem(marker, '1');
    if (storage.getItem(marker) !== '1') return;
    // A present new key always wins, even if the SDK will reject its value.
    if (storage.getItem('web-kit:session:v1') === null) {
      try {
        const legacy = JSON.parse(storage.getItem('auth-v2') ?? 'null');
        if (typeof legacy?.token === 'string') {
          const encoded = legacy.token
            .split('.')[1]
            ?.replace(/-/g, '+')
            .replace(/_/g, '/');
          if (encoded) {
            const padded = encoded + '='.repeat((4 - (encoded.length % 4)) % 4);
            const bytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
            const claims = JSON.parse(new TextDecoder().decode(bytes));
            if (
              Number.isSafeInteger(claims.uid) &&
              claims.uid > 0 &&
              typeof claims.sub === 'string' &&
              claims.sub.length > 0 &&
              ['admin', 'trusted', 'member', 'restricted', 'banned'].includes(
                claims.role,
              ) &&
              Number.isFinite(claims.crat) &&
              Number.isFinite(claims.iat) &&
              Number.isFinite(claims.exp) &&
              claims.exp * 1000 > now
            ) {
              storage.setItem(
                'web-kit:session:v1',
                JSON.stringify({
                  token: legacy.token,
                  adminMode:
                    claims.role === 'admin' && legacy.adminMode === true,
                }),
              );
            }
          }
        }
      } catch {
        /* Invalid legacy sessions fall back to the refresh Cookie. */
      }
    }
    if (storage.getItem('web-kit:theme:v1') === null) {
      try {
        const theme = JSON.parse(storage.getItem('setting') ?? 'null')?.theme;
        if (['light', 'dark', 'system'].includes(theme)) {
          storage.setItem('web-kit:theme:v1', JSON.stringify(theme));
        }
      } catch {
        /* Keep the SDK's system theme fallback. */
      }
    }
    storage.removeItem('auth-v2');
    storage.removeItem('auth');
  } catch {
    /* Unavailable storage must not block startup or restore old state. */
  }
}
