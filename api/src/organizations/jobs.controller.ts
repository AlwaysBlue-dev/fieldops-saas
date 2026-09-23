import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { memoryStorage } from 'multer';
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
import { JobExecutionService } from './job-execution.service.js';
import { JobFieldService } from './job-field.service.js';
import { JobFilesService } from './job-files.service.js';
import { CreateJobSignOffDto, UploadJobFileDto } from './dto/job-file.dto.js';
import { DOCUMENT_MAX_BYTES } from '../common/constants.js';
import { ScheduleService } from './schedule.service.js';
import {
  ConfirmSafetyControlDto,
  UpdateCompletionSummaryDto,
  UpdateJobClientContactDto,
  UpdateJobMaterialDto,
  UpdateWorkLogDto,
} from './dto/job-execution.dto.js';
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
    private readonly files: JobFilesService,
    private readonly execution: JobExecutionService,
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

  @Get(':jobId/activity')
  activity(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentUser() user: AuthUser,
    @Param('jobId') jobId: string,
  ) {
    return this.execution.listActivity(organization, user.id, jobId);
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

  @Post(':jobId/safety/:code/confirm')
  @HttpCode(HttpStatus.OK)
  @RequiresActiveSubscription()
  confirmSafety(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentUser() user: AuthUser,
    @Param('jobId') jobId: string,
    @Param('code') code: string,
    @Body() dto: ConfirmSafetyControlDto,
  ) {
    return this.execution.confirmSafety(organization, user.id, jobId, code, dto);
  }

  @Patch(':jobId/client-contact')
  @RequiresActiveSubscription()
  async updateClientContact(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentUser() user: AuthUser,
    @Param('jobId') jobId: string,
    @Body() dto: UpdateJobClientContactDto,
  ) {
    await this.execution.updateClientContact(organization, user.id, jobId, dto);
    return this.jobs.get(organization, user.id, jobId);
  }

  @Patch(':jobId/completion')
  @RequiresActiveSubscription()
  async updateCompletion(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentUser() user: AuthUser,
    @Param('jobId') jobId: string,
    @Body() dto: UpdateCompletionSummaryDto,
  ) {
    await this.execution.updateCompletion(organization, user.id, jobId, dto);
    return this.jobs.get(organization, user.id, jobId);
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

  @Patch(':jobId/work-logs/:workLogId')
  @RequiresActiveSubscription()
  updateWorkLog(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentUser() user: AuthUser,
    @Param('jobId') jobId: string,
    @Param('workLogId') workLogId: string,
    @Body() dto: UpdateWorkLogDto,
  ) {
    return this.execution.updateWorkLog(
      organization,
      user.id,
      jobId,
      workLogId,
      dto,
    );
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

  @Patch(':jobId/materials/:materialId')
  @RequiresActiveSubscription()
  updateMaterial(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentUser() user: AuthUser,
    @Param('jobId') jobId: string,
    @Param('materialId') materialId: string,
    @Body() dto: UpdateJobMaterialDto,
  ) {
    return this.execution.updateMaterial(
      organization,
      user.id,
      jobId,
      materialId,
      dto,
    );
  }

  @Delete(':jobId/materials/:materialId')
  @HttpCode(HttpStatus.OK)
  @RequiresActiveSubscription()
  removeMaterial(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentUser() user: AuthUser,
    @Param('jobId') jobId: string,
    @Param('materialId') materialId: string,
  ) {
    return this.execution.removeMaterial(organization, user.id, jobId, materialId);
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

  @Post(':jobId/files')
  @HttpCode(HttpStatus.CREATED)
  @RequiresActiveSubscription()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: DOCUMENT_MAX_BYTES },
    }),
  )
  uploadFile(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentUser() user: AuthUser,
    @Param('jobId') jobId: string,
    @UploadedFile() file: { buffer: Buffer; originalname: string; size: number },
    @Body() dto: UploadJobFileDto,
  ) {
    return this.files.uploadMultipart(organization, user, jobId, file, dto);
  }

  @Get(':jobId/files')
  listFiles(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentUser() user: AuthUser,
    @Param('jobId') jobId: string,
  ) {
    return this.files.list(organization, user.id, jobId);
  }

  @Get(':jobId/files/:fileId/access')
  fileAccess(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentUser() user: AuthUser,
    @Param('jobId') jobId: string,
    @Param('fileId') fileId: string,
  ) {
    return this.files.getAccess(organization, user.id, jobId, fileId);
  }

  @Get(':jobId/files/:fileId/content')
  @Header('X-Content-Type-Options', 'nosniff')
  async fileContent(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentUser() user: AuthUser,
    @Param('jobId') jobId: string,
    @Param('fileId') fileId: string,
    @Res() response: Response,
  ) {
    const file = await this.files.stream(organization, user.id, jobId, fileId);
    response.setHeader('Content-Type', file.mimeType);
    response.setHeader(
      'Content-Disposition',
      `inline; filename="${file.originalName.replace(/"/g, '')}"`,
    );
    response.send(file.buffer);
  }

  @Delete(':jobId/files/:fileId')
  @HttpCode(HttpStatus.OK)
  @RequiresActiveSubscription()
  deleteFile(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentUser() user: AuthUser,
    @Param('jobId') jobId: string,
    @Param('fileId') fileId: string,
  ) {
    return this.files.remove(organization, user, jobId, fileId);
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

  @Post(':jobId/sign-off')
  @HttpCode(HttpStatus.CREATED)
  @RequiresActiveSubscription()
  signOff(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentUser() user: AuthUser,
    @Param('jobId') jobId: string,
    @Body() dto: CreateJobSignOffDto,
  ) {
    return this.files.addSignature(organization, user.id, jobId, dto);
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
