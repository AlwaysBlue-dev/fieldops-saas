import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
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
  CreateTimeEntryDto,
  DecideTimeEntryDto,
  ListTimeEntriesQueryDto,
  ListTimesheetQueryDto,
  UpdateTimeEntryDto,
} from './dto/create-time-entry.dto.js';
import { TimesheetsService } from './timesheets.service.js';

@Controller('organizations/:organizationId/timesheets')
@UseGuards(JwtAuthGuard, OrganizationMembershipGuard)
export class TimesheetsController {
  constructor(private readonly timesheets: TimesheetsService) {}

  @Get()
  week(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentUser() user: AuthUser,
    @Query() query: ListTimesheetQueryDto,
  ) {
    return this.timesheets.week(organization, user.id, query);
  }

  @Get('entries')
  list(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentUser() user: AuthUser,
    @Query() query: ListTimeEntriesQueryDto,
  ) {
    return this.timesheets.listEntries(organization, user.id, query);
  }

  @Get('entries/:entryId')
  get(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentUser() user: AuthUser,
    @Param('entryId') entryId: string,
  ) {
    return this.timesheets.getEntry(organization, user.id, entryId);
  }

  @Post('entries')
  @HttpCode(HttpStatus.CREATED)
  @RequiresActiveSubscription()
  create(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateTimeEntryDto,
  ) {
    return this.timesheets.createManual(organization, user.id, dto);
  }

  @Patch('entries/:entryId')
  @RequiresActiveSubscription()
  update(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentUser() user: AuthUser,
    @Param('entryId') entryId: string,
    @Body() dto: UpdateTimeEntryDto,
  ) {
    return this.timesheets.updateManual(organization, user.id, entryId, dto);
  }

  @Post('entries/:entryId/submit')
  @RequiresActiveSubscription()
  submit(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentUser() user: AuthUser,
    @Param('entryId') entryId: string,
  ) {
    return this.timesheets.submit(organization, user.id, entryId);
  }

  @Post('entries/:entryId/decide')
  @RequiresActiveSubscription()
  decide(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentUser() user: AuthUser,
    @Param('entryId') entryId: string,
    @Body() dto: DecideTimeEntryDto,
  ) {
    return this.timesheets.decide(organization, user.id, entryId, dto);
  }
}
