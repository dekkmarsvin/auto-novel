import type { Whoami, WhoamiUser } from '@novelia/web-kit';

export function mockWhoami(user?: WhoamiUser): Whoami {
  const roles = ['banned', 'restricted', 'member', 'trusted', 'admin'];
  return {
    user,
    isSignedIn: !!user,
    isAdmin: user?.role === 'admin',
    asAdmin: user?.role === 'admin' && user.adminMode,
    roleLabel: user?.role ?? '',
    hasRoleAtLeast: (role) =>
      !!user && roles.indexOf(user.role) >= roles.indexOf(role),
    isAtLeastDaysOld: (days) =>
      !!user && Date.now() - user.createdAt >= days * 86400_000,
  };
}
