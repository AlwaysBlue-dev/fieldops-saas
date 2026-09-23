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
import {
  ActivationRequestStatus,
  CommercialRequestType,
} from '../generated/prisma/client.js';
import { CurrentUser } from '../tenancy/current-user.decorator.js';
import type { AuthUser } from '../tenancy/request-context.js';
import { CatalogService } from '../subscription/catalog.service.js';
import { ActivateSubscriptionDto } from '../subscription/dto/activate-subscription.dto.js';
import { ChangePlanDto } from '../subscription/dto/change-plan.dto.js';
import { ExtendTrialDto } from '../subscription/dto/extend-trial.dto.js';
import { RenewSubscriptionDto } from '../subscription/dto/renew-subscription.dto.js';
import { UpdateCommercialRequestDto } from '../subscription/dto/update-commercial-request.dto.js';
import {
  ListPlatformOrganizationsQueryDto,
  SetSubscriptionPeriodDto,
  SuspendOrganizationDto,
} from './dto/platform-admin.dto.js';
import { PlatformSubscriptionService } from './platform-subscription.service.js';
import { SuperAdminGuard } from './super-admin.guard.js';

@Controller('platform')
@UseGuards(JwtAuthGuard, SuperAdminGuard)
export class PlatformSubscriptionController {
  constructor(
    private readonly platform: PlatformSubscriptionService,
    private readonly catalog: CatalogService,
  ) {}

  @Get('dashboard')
  getDashboard() {
    return this.platform.getDashboard();
  }

  @Get('organizations')
  listOrganizations(@Query() query: ListPlatformOrganizationsQueryDto) {
    return this.platform.listOrganizations(query);
  }

  @Get('organizations/:organizationId')
  getOrganization(@Param('organizationId') organizationId: string) {
    return this.platform.getOrganization(organizationId);
  }

  @Get('plans')
  listPlans() {
    return this.catalog.listActivePlans();
  }

  @Get('commercial-requests')
  listCommercialRequests(
    @Query('requestType') requestType?: CommercialRequestType,
    @Query('status') status?: ActivationRequestStatus,
  ) {
    return this.platform.listRequests({ requestType, status });
  }

  @Get('activation-requests')
  listActivationRequests(
    @Query('requestType') requestType?: CommercialRequestType,
    @Query('status') status?: ActivationRequestStatus,
  ) {
    return this.platform.listRequests({
      requestType: requestType ?? CommercialRequestType.ACTIVATION,
      status,
    });
  }

  @Patch('commercial-requests/:requestId')
  updateCommercialRequest(
    @Param('requestId') requestId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateCommercialRequestDto,
  ) {
    return this.platform.updateRequest(requestId, user.id, dto);
  }

  @Patch('activation-requests/:requestId')
  updateActivationRequest(
    @Param('requestId') requestId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateCommercialRequestDto,
  ) {
    return this.platform.updateRequest(requestId, user.id, dto);
  }

  @Post('organizations/:organizationId/subscription/activate')
  @HttpCode(HttpStatus.OK)
  activate(
    @Param('organizationId') organizationId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: ActivateSubscriptionDto,
  ) {
    return this.platform.activate(organizationId, user.id, dto);
  }

  @Post('organizations/:organizationId/subscription/renew')
  @HttpCode(HttpStatus.OK)
  renew(
    @Param('organizationId') organizationId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: RenewSubscriptionDto,
  ) {
    return this.platform.renew(organizationId, user.id, dto);
  }

  @Post('organizations/:organizationId/subscription/change-plan')
  @HttpCode(HttpStatus.OK)
  changePlan(
    @Param('organizationId') organizationId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangePlanDto,
  ) {
    return this.platform.changePlan(organizationId, user.id, dto);
  }

  @Post('organizations/:organizationId/subscription/set-period')
  @HttpCode(HttpStatus.OK)
  setPeriod(
    @Param('organizationId') organizationId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: SetSubscriptionPeriodDto,
  ) {
    return this.platform.setPeriod(organizationId, user.id, dto);
  }

  @Post('organizations/:organizationId/subscription/extend-trial')
  @HttpCode(HttpStatus.OK)
  extendTrial(
    @Param('organizationId') organizationId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: ExtendTrialDto,
  ) {
    return this.platform.extendTrial(organizationId, user.id, dto);
  }

  @Post('organizations/:organizationId/subscription/suspend')
  @HttpCode(HttpStatus.OK)
  suspend(
    @Param('organizationId') organizationId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: SuspendOrganizationDto,
  ) {
    return this.platform.suspend(organizationId, user.id, dto);
  }

  @Post('organizations/:organizationId/subscription/reactivate')
  @HttpCode(HttpStatus.OK)
  reactivate(
    @Param('organizationId') organizationId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.platform.reactivate(organizationId, user.id);
  }

  @Post('organizations/:organizationId/subscription/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(
    @Param('organizationId') organizationId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.platform.cancel(organizationId, user.id);
  }
}
