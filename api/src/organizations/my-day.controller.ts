import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentOrganization } from '../tenancy/current-organization.decorator.js';
import { CurrentUser } from '../tenancy/current-user.decorator.js';
import { OrganizationMembershipGuard } from '../tenancy/organization-membership.guard.js';
import type { AuthUser, OrganizationContext } from '../tenancy/request-context.js';
import { RequiresActiveSubscription } from '../subscription/requires-active-subscription.decorator.js';
import { ClockInDto, ClockOutDto } from './dto/clock-action.dto.js';
import { ClockService } from './clock.service.js';
import { MyDayService } from './my-day.service.js';

@Controller('organizations/:organizationId/my-day')
@UseGuards(JwtAuthGuard, OrganizationMembershipGuard)
export class MyDayController {
  constructor(
    private readonly myDay: MyDayService,
    private readonly clocks: ClockService,
  ) {}

  @Get()
  getDay(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentUser() user: AuthUser,
  ) {
    return this.myDay.get(organization, user.id);
  }

  @Post('clock-in')
  @HttpCode(HttpStatus.OK)
  @RequiresActiveSubscription()
  clockIn(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentUser() user: AuthUser,
    @Body() dto: ClockInDto,
  ) {
    return this.clocks.clockIn(organization, user.id, dto);
  }

  @Post('clock-out')
  @HttpCode(HttpStatus.OK)
  @RequiresActiveSubscription()
  clockOut(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentUser() user: AuthUser,
    @Body() dto: ClockOutDto,
  ) {
    return this.clocks.clockOut(organization, user.id, dto);
  }
}
