import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthService } from '../auth/auth.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentUser } from '../tenancy/current-user.decorator.js';
import type { AuthUser } from '../tenancy/request-context.js';

@Controller('me')
@UseGuards(JwtAuthGuard)
export class MeController {
  constructor(private readonly auth: AuthService) {}

  @Get('organizations')
  listOrganizations(@CurrentUser() user: AuthUser) {
    return this.auth.listOrganizations(user.id);
  }
}
