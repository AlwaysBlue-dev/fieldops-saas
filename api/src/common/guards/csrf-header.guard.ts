import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { CSRF_HEADER, CSRF_HEADER_VALUE } from '../constants.js';

@Injectable()
export class CsrfHeaderGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const method = request.method.toUpperCase();
    if (['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      return true;
    }
    if (request.path.includes('/health')) {
      return true;
    }
    const header = request.headers[CSRF_HEADER];
    const value = Array.isArray(header) ? header[0] : header;
    if (value === CSRF_HEADER_VALUE) {
      return true;
    }
    throw new ForbiddenException('Missing application request header');
  }
}
