import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { SubscriptionModule } from '../subscription/subscription.module.js';
import { ApprovalNotificationHook } from './approval-events.js';
import { ApprovalRecordsService } from './approval-records.service.js';
import { JobApprovalValidationService } from './approval-validation.service.js';
import { ApprovalsController } from './approvals.controller.js';
import { ApprovalsService } from './approvals.service.js';
import { ClientsController } from './clients.controller.js';
import { ClientsService } from './clients.service.js';
import { SitesController } from './sites.controller.js';
import { SitesService } from './sites.service.js';
import { TeamsController } from './teams.controller.js';
import { TeamsService } from './teams.service.js';
import { TechniciansController } from './technicians.controller.js';
import { TechniciansService } from './technicians.service.js';
import { FilesController } from './files.controller.js';
import { InvitationsController } from './invitations.controller.js';
import { InvitationsService } from './invitations.service.js';
import { ClockService } from './clock.service.js';
import { ClockSessionsController } from './clock-sessions.controller.js';
import { JobsController } from './jobs.controller.js';
import { JobsService } from './jobs.service.js';
import { JobExecutionService } from './job-execution.service.js';
import { JobFieldService } from './job-field.service.js';
import { JobFilesService } from './job-files.service.js';
import { JobNotificationHook } from './job-events.js';
import { JobWorkflowService } from './job-workflow.service.js';
import { MyDayController } from './my-day.controller.js';
import { MyDayService } from './my-day.service.js';
import { ScheduleController } from './schedule.controller.js';
import { ScheduleService } from './schedule.service.js';
import { MembersController } from './members.controller.js';
import { MembersService } from './members.service.js';
import { OrganizationsController } from './organizations.controller.js';
import { OrganizationBrandingService } from './organization-branding.service.js';
import { OrganizationStorageController } from './organization-storage.controller.js';
import { OrganizationStorageService } from './organization-storage.service.js';
import { OrganizationsService } from './organizations.service.js';
import { PublicInvitationsController } from './public-invitations.controller.js';
import { OvertimeNotificationHook } from './overtime-events.js';
import { OvertimeController } from './overtime.controller.js';
import { OvertimeService } from './overtime.service.js';
import { OvertimeValidationService } from './overtime-validation.service.js';
import { TimesheetValidationService } from './timesheet-validation.service.js';
import { TimesheetsController } from './timesheets.controller.js';
import { TimesheetsService } from './timesheets.service.js';
import { JobReportPdfService } from './job-report-pdf.service.js';
import { ReportsController } from './reports.controller.js';
import { ReportsService } from './reports.service.js';

@Module({
  imports: [AuthModule, SubscriptionModule],
  controllers: [
    OrganizationsController,
    OrganizationStorageController,
    MembersController,
    InvitationsController,
    PublicInvitationsController,
    JobsController,
    ClockSessionsController,
    TimesheetsController,
    OvertimeController,
    MyDayController,
    ScheduleController,
    ClientsController,
    SitesController,
    TeamsController,
    TechniciansController,
    FilesController,
    ApprovalsController,
    ReportsController,
  ],
  providers: [
    OrganizationsService,
    OrganizationBrandingService,
    OrganizationStorageService,
    MembersService,
    InvitationsService,
    ClientsService,
    SitesService,
    TeamsService,
    TechniciansService,
    JobWorkflowService,
    JobExecutionService,
    JobsService,
    JobFieldService,
    JobFilesService,
    ClockService,
    JobNotificationHook,
    OvertimeValidationService,
    OvertimeNotificationHook,
    OvertimeService,
    TimesheetValidationService,
    TimesheetsService,
    MyDayService,
    ScheduleService,
    ApprovalRecordsService,
    ApprovalNotificationHook,
    JobApprovalValidationService,
    ApprovalsService,
    JobReportPdfService,
    ReportsService,
  ],
})
export class OrganizationsModule {}
