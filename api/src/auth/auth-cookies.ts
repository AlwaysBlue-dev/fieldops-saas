import type { CookieOptions, Response } from 'express';
import { ConfigService } from '@nestjs/config';
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
} from '../common/constants.js';
import { durationToMs } from '../common/duration.js';
import type { EnvironmentVariables } from '../config/env.js';

export function cookieOptions(
  config: ConfigService<EnvironmentVariables, true>,
  maxAgeMs: number,
): CookieOptions {
  return {
    httpOnly: true,
    secure: config.get('COOKIE_SECURE', { infer: true }),
    sameSite: config.get('COOKIE_SAME_SITE', { infer: true }),
    path: '/',
    maxAge: maxAgeMs,
  };
}

export function setAuthCookies(
  response: Response,
  config: ConfigService<EnvironmentVariables, true>,
  accessToken: string,
  refreshToken: string,
) {
  response.cookie(
    ACCESS_COOKIE,
    accessToken,
    cookieOptions(
      config,
      durationToMs(config.get('JWT_ACCESS_EXPIRES_IN', { infer: true })),
    ),
  );
  response.cookie(
    REFRESH_COOKIE,
    refreshToken,
    cookieOptions(
      config,
      durationToMs(config.get('JWT_REFRESH_EXPIRES_IN', { infer: true })),
    ),
  );
}

export function clearAuthCookies(
  response: Response,
  config: ConfigService<EnvironmentVariables, true>,
) {
  const base = cookieOptions(config, 0);
  response.clearCookie(ACCESS_COOKIE, { ...base, maxAge: undefined });
  response.clearCookie(REFRESH_COOKIE, { ...base, maxAge: undefined });
}
