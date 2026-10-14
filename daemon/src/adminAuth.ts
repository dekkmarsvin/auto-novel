import { timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';

const ADMIN_TOKEN_SCHEME = 'Bearer ';

export function createAdminAuthMiddleware(adminToken: string): RequestHandler {
  return (req, res, next) => {
    const suppliedToken = readAdminToken(
      req.header('authorization'),
      req.header('x-admin-token'),
    );

    if (!suppliedToken || !tokensMatch(suppliedToken, adminToken)) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    next();
  };
}

function readAdminToken(authorization?: string, headerToken?: string) {
  if (authorization?.startsWith(ADMIN_TOKEN_SCHEME)) {
    return authorization.slice(ADMIN_TOKEN_SCHEME.length);
  }
  return headerToken;
}

function tokensMatch(suppliedToken: string, expectedToken: string) {
  const supplied = Buffer.from(suppliedToken);
  const expected = Buffer.from(expectedToken);
  return (
    supplied.length === expected.length && timingSafeEqual(supplied, expected)
  );
}
