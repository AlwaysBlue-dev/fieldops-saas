import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RequiresActiveSubscription } from '../subscription/requires-active-subscription.decorator.js';
import { CurrentOrganization } from '../tenancy/current-organization.decorator.js';
import { CurrentUser } from '../tenancy/current-user.decorator.js';
import { OrganizationMembershipGuard } from '../tenancy/organization-membership.guard.js';
import type { AuthUser, OrganizationContext } from '../tenancy/request-context.js';
import {
  CreateOvertimeAuthorizationDto,
  DecideOvertimeDto,
  ListOvertimeQueryDto,
} from './dto/overtime-authorization.dto.js';
import { OvertimeService } from './overtime.service.js';

@Controller('organizations/:organizationId/overtime-authorizations')
@UseGuards(JwtAuthGuard, OrganizationMembershipGuard)
export class OvertimeController {
  constructor(private readonly overtime: OvertimeService) {}

  @Get()
  list(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentUser() user: AuthUser,
    @Query() query: ListOvertimeQueryDto,
  ) {
    return this.overtime.list(organization, user.id, query);
  }

  @Get(':authorizationId')
  get(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentUser() user: AuthUser,
    @Param('authorizationId') authorizationId: string,
  ) {
    return this.overtime.get(organization, user.id, authorizationId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequiresActiveSubscription()
  create(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateOvertimeAuthorizationDto,
  ) {
    return this.overtime.create(organization, user.id, dto);
  }

  @Post(':authorizationId/decide')
  @HttpCode(HttpStatus.OK)
  @RequiresActiveSubscription()
  decide(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentUser() user: AuthUser,
    @Param('authorizationId') authorizationId: string,
    @Body() dto: DecideOvertimeDto,
  ) {
    return this.overtime.decide(organization, user.id, authorizationId, dto);
  }

  @Post(':authorizationId/cancel')
  @HttpCode(HttpStatus.OK)
  @RequiresActiveSubscription()
  cancel(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentUser() user: AuthUser,
    @Param('authorizationId') authorizationId: string,
  ) {
    return this.overtime.cancel(organization, user.id, authorizationId);
  }
}
