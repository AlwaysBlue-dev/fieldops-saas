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
import { OrganizationRole } from '../generated/prisma/client.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentOrganization } from '../tenancy/current-organization.decorator.js';
import { CurrentUser } from '../tenancy/current-user.decorator.js';
import { OrganizationMembershipGuard } from '../tenancy/organization-membership.guard.js';
import { OrganizationRoles } from '../tenancy/organization-roles.decorator.js';
import { OrganizationRolesGuard } from '../tenancy/organization-roles.guard.js';
import type { AuthUser, OrganizationContext } from '../tenancy/request-context.js';
import { RequiresActiveSubscription } from '../subscription/requires-active-subscription.decorator.js';
import { CancelJobDto, ReturnJobDto } from './dto/job-action.dto.js';
import { CreateJobDto } from './dto/create-job.dto.js';
import { ListJobsQueryDto } from './dto/list-jobs-query.dto.js';
import { ScheduleJobDto } from './dto/schedule-job.dto.js';
import { UpdateJobDto } from './dto/update-job.dto.js';
import { JobsService } from './jobs.service.js';
import { JobFieldService } from './job-field.service.js';
import { ScheduleService } from './schedule.service.js';
import {
  CreateJobMaterialDto,
  CreateJobPhotoDto,
  CreateJobSignatureDto,
  CreateWorkLogDto,
} from './dto/job-field-action.dto.js';

const EDITOR_ROLES = [
  OrganizationRole.OWNER,
  OrganizationRole.ADMIN,
  OrganizationRole.OPERATIONS_MANAGER,
  OrganizationRole.SUPERVISOR,
] as const;

@Controller('organizations/:organizationId/jobs')
@UseGuards(JwtAuthGuard, OrganizationMembershipGuard)
export class JobsController {
  constructor(
    private readonly jobs: JobsService,
    private readonly schedule: ScheduleService,
    private readonly field: JobFieldService,
  ) {}

  @Get()
  list(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentUser() user: AuthUser,
    @Query() query: ListJobsQueryDto,
  ) {
    return this.jobs.list(organization, user.id, query);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequiresActiveSubscription()
  @UseGuards(OrganizationRolesGuard)
  @OrganizationRoles(...EDITOR_ROLES)
  create(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateJobDto,
  ) {
    return this.jobs.create(organization, user.id, dto);
  }

  @Get(':jobId')
  getJob(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentUser() user: AuthUser,
    @Param('jobId') jobId: string,
  ) {
    return this.jobs.get(organization, user.id, jobId);
  }

  @Patch(':jobId')
  @RequiresActiveSubscription()
  @UseGuards(OrganizationRolesGuard)
  @OrganizationRoles(...EDITOR_ROLES)
  updateJob(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentUser() user: AuthUser,
    @Param('jobId') jobId: string,
    @Body() dto: UpdateJobDto,
  ) {
    return this.jobs.update(organization, user.id, jobId, dto);
  }

  @Post(':jobId/schedule')
  @HttpCode(HttpStatus.OK)
  @RequiresActiveSubscription()
  @UseGuards(OrganizationRolesGuard)
  @OrganizationRoles(...EDITOR_ROLES)
  scheduleJob(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentUser() user: AuthUser,
    @Param('jobId') jobId: string,
    @Body() dto: ScheduleJobDto,
  ) {
    return this.schedule.schedule(organization, user.id, jobId, dto);
  }

  @Post(':jobId/assign')
  @HttpCode(HttpStatus.OK)
  @RequiresActiveSubscription()
  @UseGuards(OrganizationRolesGuard)
  @OrganizationRoles(...EDITOR_ROLES)
  assignJob(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentUser() user: AuthUser,
    @Param('jobId') jobId: string,
    @Body() dto: ScheduleJobDto,
  ) {
    return this.schedule.schedule(organization, user.id, jobId, dto);
  }

  @Post(':jobId/dispatch')
  @HttpCode(HttpStatus.OK)
  @RequiresActiveSubscription()
  @UseGuards(OrganizationRolesGuard)
  @OrganizationRoles(...EDITOR_ROLES)
  dispatch(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentUser() user: AuthUser,
    @Param('jobId') jobId: string,
  ) {
    return this.jobs.dispatch(organization, user.id, jobId);
  }

  @Post(':jobId/start')
  @HttpCode(HttpStatus.OK)
  @RequiresActiveSubscription()
  start(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentUser() user: AuthUser,
    @Param('jobId') jobId: string,
  ) {
    return this.jobs.start(organization, user.id, jobId);
  }

  @Post(':jobId/submit')
  @HttpCode(HttpStatus.OK)
  @RequiresActiveSubscription()
  submit(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentUser() user: AuthUser,
    @Param('jobId') jobId: string,
  ) {
    return this.jobs.submit(organization, user.id, jobId);
  }

  @Post(':jobId/complete')
  @HttpCode(HttpStatus.OK)
  @RequiresActiveSubscription()
  @UseGuards(OrganizationRolesGuard)
  @OrganizationRoles(...EDITOR_ROLES)
  complete(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentUser() user: AuthUser,
    @Param('jobId') jobId: string,
  ) {
    return this.jobs.complete(organization, user.id, jobId);
  }

  @Post(':jobId/return')
  @HttpCode(HttpStatus.OK)
  @RequiresActiveSubscription()
  @UseGuards(OrganizationRolesGuard)
  @OrganizationRoles(...EDITOR_ROLES)
  returnJob(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentUser() user: AuthUser,
    @Param('jobId') jobId: string,
    @Body() dto: ReturnJobDto,
  ) {
    return this.jobs.returnJob(organization, user.id, jobId, dto);
  }

  @Post(':jobId/resume')
  @HttpCode(HttpStatus.OK)
  @RequiresActiveSubscription()
  resume(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentUser() user: AuthUser,
    @Param('jobId') jobId: string,
  ) {
    return this.jobs.resume(organization, user.id, jobId);
  }

  @Post(':jobId/work-logs')
  @HttpCode(HttpStatus.CREATED)
  @RequiresActiveSubscription()
  addWorkLog(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentUser() user: AuthUser,
    @Param('jobId') jobId: string,
    @Body() dto: CreateWorkLogDto,
  ) {
    return this.field.addWorkLog(organization, user.id, jobId, dto);
  }

  @Post(':jobId/materials')
  @HttpCode(HttpStatus.CREATED)
  @RequiresActiveSubscription()
  addMaterial(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentUser() user: AuthUser,
    @Param('jobId') jobId: string,
    @Body() dto: CreateJobMaterialDto,
  ) {
    return this.field.addMaterial(organization, user.id, jobId, dto);
  }

  @Post(':jobId/photos')
  @HttpCode(HttpStatus.CREATED)
  @RequiresActiveSubscription()
  addPhoto(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentUser() user: AuthUser,
    @Param('jobId') jobId: string,
    @Body() dto: CreateJobPhotoDto,
  ) {
    return this.field.addPhoto(organization, user.id, jobId, dto);
  }

  @Post(':jobId/signatures')
  @HttpCode(HttpStatus.CREATED)
  @RequiresActiveSubscription()
  addSignature(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentUser() user: AuthUser,
    @Param('jobId') jobId: string,
    @Body() dto: CreateJobSignatureDto,
  ) {
    return this.field.addSignature(organization, user.id, jobId, dto);
  }

  @Post(':jobId/cancel')
  @HttpCode(HttpStatus.OK)
  @RequiresActiveSubscription()
  @UseGuards(OrganizationRolesGuard)
  @OrganizationRoles(...EDITOR_ROLES)
  cancel(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentUser() user: AuthUser,
    @Param('jobId') jobId: string,
    @Body() dto: CancelJobDto,
  ) {
    return this.jobs.cancel(organization, user.id, jobId, dto);
  }
}
