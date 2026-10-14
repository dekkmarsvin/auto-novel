export function authReturnPath(from: unknown): string {
  return typeof from === 'string' &&
    from.startsWith('/') &&
    !from.startsWith('//') &&
    !from.includes('\\') &&
    !/^\/auth(?:[/?#]|$)/.test(from)
    ? from
    : '/';
}
