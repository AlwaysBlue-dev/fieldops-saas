import { Body, Controller, Headers, Post, Req, UseGuards, BadRequestException } from '@nestjs/common';
import { IsInt, Max, Min } from 'class-validator';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentOrganization } from '../tenancy/current-organization.decorator.js';
import { CurrentUser } from '../tenancy/current-user.decorator.js';
import { OrganizationMembershipGuard } from '../tenancy/organization-membership.guard.js';
import { OrganizationRoles } from '../tenancy/organization-roles.decorator.js';
import { OrganizationRolesGuard } from '../tenancy/organization-roles.guard.js';
import { OrganizationRole } from '../generated/prisma/client.js';
import type { AuthUser, OrganizationContext } from '../tenancy/request-context.js';
import { PaddleService } from './paddle.service.js';

class PaddleCheckoutDto {
  @IsInt()
  @Min(1)
  @Max(5)
  termYears!: number;
}

@Controller()
export class PaddleController {
  constructor(private readonly paddle: PaddleService) {}

  @Post('organizations/:organizationId/invoices/:invoiceId/paddle-checkout')
  @UseGuards(JwtAuthGuard, OrganizationMembershipGuard, OrganizationRolesGuard)
  @OrganizationRoles(OrganizationRole.OWNER)
  createCheckout(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentUser() user: AuthUser,
    @Req() request: Request,
    @Body() body: PaddleCheckoutDto,
  ) {
    const invoiceId = request.params.invoiceId;
    if (typeof invoiceId !== 'string') throw new BadRequestException();
    return this.paddle.createInvoiceCheckout(organization.organizationId, invoiceId, user.id, body.termYears);
  }

  @Post('organizations/:organizationId/paddle-portal')
  @UseGuards(JwtAuthGuard, OrganizationMembershipGuard, OrganizationRolesGuard)
  @OrganizationRoles(OrganizationRole.OWNER)
  createPortalSession(@CurrentOrganization() organization: OrganizationContext) {
    return this.paddle.createCustomerPortalSession(organization.organizationId);
  }

  @Post('webhooks/paddle')
  webhook(
    @Req() request: Request & { rawBody?: Buffer },
    @Headers('paddle-signature') signature?: string,
  ) {
    if (!request.rawBody || !signature) throw new BadRequestException('Missing Paddle signature or raw body');
    return this.paddle.processWebhook(request.rawBody, signature);
  }
}
