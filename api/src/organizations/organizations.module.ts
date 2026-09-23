import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { SubscriptionModule } from '../subscription/subscription.module.js';
import { ApprovalsController } from './approvals.controller.js';
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
import { JobFieldService } from './job-field.service.js';
import { JobWorkflowService } from './job-workflow.service.js';
import { MyDayController } from './my-day.controller.js';
import { MyDayService } from './my-day.service.js';
import { ObjectStorageService } from './object-storage.service.js';
import { ScheduleController } from './schedule.controller.js';
import { ScheduleService } from './schedule.service.js';
import { MembersController } from './members.controller.js';
import { MembersService } from './members.service.js';
import { OrganizationsController } from './organizations.controller.js';
import { OrganizationsService } from './organizations.service.js';
import { PublicInvitationsController } from './public-invitations.controller.js';
import { TenantResourcesService } from './tenant-resources.service.js';

@Module({
  imports: [AuthModule, SubscriptionModule],
  controllers: [
    OrganizationsController,
    MembersController,
    InvitationsController,
    PublicInvitationsController,
    JobsController,
    ClockSessionsController,
    MyDayController,
    ScheduleController,
    ClientsController,
    SitesController,
    TeamsController,
    TechniciansController,
    FilesController,
    ApprovalsController,
  ],
  providers: [
    OrganizationsService,
    MembersService,
    InvitationsService,
    ClientsService,
    SitesService,
    TeamsService,
    TechniciansService,
    JobWorkflowService,
    JobsService,
    JobFieldService,
    ClockService,
    MyDayService,
    ObjectStorageService,
    ScheduleService,
    TenantResourcesService,
  ],
})
export class OrganizationsModule {}
