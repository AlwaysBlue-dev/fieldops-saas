import { compare, hash } from 'bcrypt';
import { BCRYPT_ROUNDS } from '../common/constants.js';

export function hashPassword(password: string): Promise<string> {
  return hash(password, BCRYPT_ROUNDS);
}

export function verifyPassword(
  password: string,
  passwordHash: string,
): Promise<boolean> {
  return compare(password, passwordHash);
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
