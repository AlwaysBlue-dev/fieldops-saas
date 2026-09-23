import {
  Controller,
  Get,
  Header,
  Param,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentOrganization } from '../tenancy/current-organization.decorator.js';
import { CurrentUser } from '../tenancy/current-user.decorator.js';
import { OrganizationMembershipGuard } from '../tenancy/organization-membership.guard.js';
import type { AuthUser, OrganizationContext } from '../tenancy/request-context.js';
import { ReportFiltersDto } from './dto/report-filters.dto.js';
import { ReportsService } from './reports.service.js';

@Controller('organizations/:organizationId/reports')
@UseGuards(JwtAuthGuard, OrganizationMembershipGuard)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('summary')
  summary(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentUser() user: AuthUser,
  ) {
    return this.reports.summary(organization, user.id);
  }

  @Get('job-status')
  jobStatus(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentUser() user: AuthUser,
    @Query() query: ReportFiltersDto,
  ) {
    return this.reports.jobStatus(organization, user.id, query);
  }

  @Get('labour')
  labour(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentUser() user: AuthUser,
    @Query() query: ReportFiltersDto,
  ) {
    return this.reports.labour(organization, user.id, query);
  }

  @Get('jobs')
  jobs(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentUser() user: AuthUser,
    @Query() query: ReportFiltersDto,
  ) {
    return this.reports.jobsTable(organization, user.id, query);
  }

  @Get('exports/jobs.csv')
  async exportJobs(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentUser() user: AuthUser,
    @Query() query: ReportFiltersDto,
    @Res() response: Response,
  ) {
    const { buffer, filename } = await this.reports.exportJobsCsv(
      organization,
      user.id,
      query,
    );
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"`,
    );
    response.send(buffer);
  }

  @Get('exports/timesheets.csv')
  async exportTimesheets(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentUser() user: AuthUser,
    @Query() query: ReportFiltersDto,
    @Res() response: Response,
  ) {
    const { buffer, filename } = await this.reports.exportTimesheetsCsv(
      organization,
      user.id,
      query,
    );
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"`,
    );
    response.send(buffer);
  }

  @Get('exports/labour.csv')
  async exportLabour(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentUser() user: AuthUser,
    @Query() query: ReportFiltersDto,
    @Res() response: Response,
  ) {
    const { buffer, filename } = await this.reports.exportLabourCsv(
      organization,
      user.id,
      query,
    );
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"`,
    );
    response.send(buffer);
  }

  @Get('jobs/:jobId/pdf')
  @Header('Content-Type', 'application/pdf')
  async jobPdf(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentUser() user: AuthUser,
    @Param('jobId') jobId: string,
    @Res() response: Response,
  ) {
    const { buffer, filename } = await this.reports.jobPdf(
      organization,
      user.id,
      jobId,
    );
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"`,
    );
    response.send(buffer);
  }
}
