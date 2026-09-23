import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import type { Response } from 'express';
import { Observable, tap } from 'rxjs';
import type { AuthenticatedRequest } from '../../tenancy/request-context.js';

const REDACTED_KEYS = new Set([
  'password',
  'token',
  'accessToken',
  'refreshToken',
  'authorization',
  'cookie',
  'passwordhash',
]);

@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<AuthenticatedRequest>();
    const response = http.getResponse<Response>();
    const started = Date.now();

    return next.handle().pipe(
      tap(() => {
        if (request.path.includes('/health')) {
          return;
        }
        const userId = request.user?.id ?? '-';
        const organizationId = request.organization?.organizationId ?? '-';
        this.logger.log(
          `${request.method} ${request.originalUrl} ${response.statusCode} ${Date.now() - started}ms user=${userId} org=${organizationId}`,
        );
      }),
    );
  }
}

export function redact(value: unknown): unknown {
  if (!value || typeof value !== 'object') {
    return value;
  }
  const entries = Object.entries(value as Record<string, unknown>).map(
    ([key, nested]) => [
      key,
      REDACTED_KEYS.has(key.toLowerCase()) ? '[redacted]' : nested,
    ],
  );
  return Object.fromEntries(entries);
}
