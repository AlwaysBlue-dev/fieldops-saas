import { Body, Controller, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentUser } from '../tenancy/current-user.decorator.js';
import type { AuthUser } from '../tenancy/request-context.js';
import { ActivateSubscriptionDto } from '../subscription/dto/activate-subscription.dto.js';
import { ExtendTrialDto } from '../subscription/dto/extend-trial.dto.js';
import { PlatformSubscriptionService } from './platform-subscription.service.js';
import { SuperAdminGuard } from './super-admin.guard.js';

@Controller('platform/organizations/:organizationId/subscription')
@UseGuards(JwtAuthGuard, SuperAdminGuard)
export class PlatformSubscriptionController {
  constructor(private readonly platform: PlatformSubscriptionService) {}

  @Post('activate')
  @HttpCode(HttpStatus.OK)
  activate(
    @Param('organizationId') organizationId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: ActivateSubscriptionDto,
  ) {
    return this.platform.activate(organizationId, user.id, dto);
  }

  @Post('extend-trial')
  @HttpCode(HttpStatus.OK)
  extendTrial(
    @Param('organizationId') organizationId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: ExtendTrialDto,
  ) {
    return this.platform.extendTrial(organizationId, user.id, dto);
  }

  @Post('suspend')
  @HttpCode(HttpStatus.OK)
  suspend(
    @Param('organizationId') organizationId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.platform.suspend(organizationId, user.id);
  }

  @Post('reactivate')
  @HttpCode(HttpStatus.OK)
  reactivate(
    @Param('organizationId') organizationId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.platform.reactivate(organizationId, user.id);
  }

  @Post('cancel')
  @HttpCode(HttpStatus.OK)
  cancel(
    @Param('organizationId') organizationId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.platform.cancel(organizationId, user.id);
  }
}
