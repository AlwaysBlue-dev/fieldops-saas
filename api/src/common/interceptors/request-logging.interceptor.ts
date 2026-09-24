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

const SLOW_MS = 750;

@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');
  private readonly verbose = process.env.NODE_ENV !== 'production';

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<AuthenticatedRequest>();
    const response = http.getResponse<Response>();
    const started = Date.now();

    return next.handle().pipe(
      tap({
        next: () => this.writeLog(request, response.statusCode, started),
        error: (error: unknown) => {
          const status =
            typeof error === 'object' &&
            error !== null &&
            'status' in error &&
            typeof (error as { status?: unknown }).status === 'number'
              ? (error as { status: number }).status
              : 500;
          this.writeLog(request, status, started);
        },
      }),
    );
  }

  private writeLog(
    request: AuthenticatedRequest,
    statusCode: number,
    started: number,
  ) {
    if (request.path.includes('/health')) {
      return;
    }
    const elapsed = Date.now() - started;
    const noteworthy = statusCode >= 400 || elapsed >= SLOW_MS;
    if (!this.verbose && !noteworthy) {
      return;
    }
    const userId = request.user?.id ?? '-';
    const organizationId = request.organization?.organizationId ?? '-';
    const line = `${request.method} ${request.originalUrl} ${statusCode} ${elapsed}ms user=${userId} org=${organizationId}`;
    if (statusCode >= 500) {
      this.logger.error(line);
    } else if (statusCode >= 400 || elapsed >= SLOW_MS) {
      this.logger.warn(line);
    } else {
      this.logger.log(line);
    }
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
