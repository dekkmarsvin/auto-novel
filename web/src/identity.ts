import type { Whoami } from '@novelia/web-kit';

/** Shared glossaries identify their author by username, not a legacy user DTO. */
export const isCurrentAuthor = (
  whoami: Pick<Whoami, 'user'>,
  username: string,
) => whoami.user?.username === username;
