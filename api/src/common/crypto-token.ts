import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export function generateUrlToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function tokenMatches(token: string, tokenHash: string): boolean {
  const computed = Buffer.from(hashToken(token));
  const stored = Buffer.from(tokenHash);
  if (computed.length !== stored.length) {
    return false;
  }
  return timingSafeEqual(computed, stored);
}
