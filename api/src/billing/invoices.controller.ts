import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { OrganizationRole } from '../generated/prisma/client.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentOrganization } from '../tenancy/current-organization.decorator.js';
import { CurrentUser } from '../tenancy/current-user.decorator.js';
import { OrganizationMembershipGuard } from '../tenancy/organization-membership.guard.js';
import { OrganizationRoles } from '../tenancy/organization-roles.decorator.js';
import { OrganizationRolesGuard } from '../tenancy/organization-roles.guard.js';
import type { AuthUser, OrganizationContext } from '../tenancy/request-context.js';
import { ListInvoicesQueryDto } from './dto/list-invoices-query.dto.js';
import { PaymentNoticeDto } from './dto/payment-notice.dto.js';
import { InvoiceService } from './invoice.service.js';

@Controller('organizations/:organizationId/invoices')
@UseGuards(JwtAuthGuard, OrganizationMembershipGuard, OrganizationRolesGuard)
@OrganizationRoles(OrganizationRole.OWNER)
export class InvoicesController {
  constructor(private readonly invoices: InvoiceService) {}

  @Get()
  list(
    @CurrentOrganization() organization: OrganizationContext,
    @Query() query: ListInvoicesQueryDto,
  ) {
    return this.invoices.listForOrganization(organization.organizationId, query);
  }

  @Get(':invoiceId')
  get(
    @CurrentOrganization() organization: OrganizationContext,
    @Param('invoiceId') invoiceId: string,
  ) {
    return this.invoices.getForOrganization(organization.organizationId, invoiceId);
  }

  @Get(':invoiceId/pdf')
  async pdf(
    @CurrentOrganization() organization: OrganizationContext,
    @Param('invoiceId') invoiceId: string,
    @Res() response: Response,
  ) {
    const { buffer, filename } = await this.invoices.pdfForOrganization(
      organization.organizationId,
      invoiceId,
    );
    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    response.send(buffer);
  }

  @Post(':invoiceId/payment-notices')
  reportPayment(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentUser() user: AuthUser,
    @Param('invoiceId') invoiceId: string,
    @Body() dto: PaymentNoticeDto,
  ) {
    return this.invoices.submitPaymentNotice(organization, user, invoiceId, dto);
  }
}
