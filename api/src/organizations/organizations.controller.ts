import {
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  Body,
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
import { AdvanceOnboardingDto } from './dto/advance-onboarding.dto.js';
import {
  UpdateOrganizationDto,
  UpdateOrganizationSettingsDto,
} from './dto/update-organization.dto.js';
import { RequiresActiveSubscription } from '../subscription/requires-active-subscription.decorator.js';
import { OrganizationBrandingService } from './organization-branding.service.js';
import { OrganizationsService } from './organizations.service.js';

const LOGO_MAX_BYTES = 2 * 1024 * 1024;

@Controller('organizations/:organizationId')
@UseGuards(JwtAuthGuard, OrganizationMembershipGuard, OrganizationRolesGuard)
export class OrganizationsController {
  constructor(
    private readonly organizations: OrganizationsService,
    private readonly branding: OrganizationBrandingService,
  ) {}

  @Get()
  get(@CurrentOrganization() organization: OrganizationContext) {
    return this.organizations.get(organization.organizationId);
  }

  @Patch()
  @RequiresActiveSubscription()
  @OrganizationRoles(OrganizationRole.OWNER, OrganizationRole.ADMIN)
  update(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateOrganizationDto,
  ) {
    return this.organizations.updateProfile(organization, dto, user.id);
  }

  @Get('settings')
  settings(@CurrentOrganization() organization: OrganizationContext) {
    return this.organizations.get(organization.organizationId);
  }

  @Patch('settings')
  @RequiresActiveSubscription()
  @OrganizationRoles(OrganizationRole.OWNER, OrganizationRole.ADMIN)
  updateSettings(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateOrganizationSettingsDto,
  ) {
    return this.organizations.updateSettings(organization, dto, user.id);
  }

  @Get('onboarding')
  @OrganizationRoles(OrganizationRole.OWNER, OrganizationRole.ADMIN)
  onboarding(@CurrentOrganization() organization: OrganizationContext) {
    return this.organizations.get(organization.organizationId);
  }

  @Post('onboarding')
  @RequiresActiveSubscription()
  @OrganizationRoles(OrganizationRole.OWNER, OrganizationRole.ADMIN)
  advance(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentUser() user: AuthUser,
    @Body() dto: AdvanceOnboardingDto,
  ) {
    return this.organizations.advanceOnboarding(organization, dto, user.id);
  }

  @Post('branding/logo')
  @HttpCode(HttpStatus.OK)
  @RequiresActiveSubscription()
  @OrganizationRoles(OrganizationRole.OWNER, OrganizationRole.ADMIN)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: LOGO_MAX_BYTES },
    }),
  )
  uploadLogo(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentUser() user: AuthUser,
    @UploadedFile()
    file: { buffer: Buffer; originalname: string; size: number },
  ) {
    return this.branding.uploadLogo(organization, user.id, file);
  }

  @Get('branding/logo')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Cache-Control', 'private, max-age=60')
  async getLogo(
    @CurrentOrganization() organization: OrganizationContext,
    @Res() response: Response,
  ) {
    const logo = await this.branding.streamLogo(organization);
    response.setHeader('Content-Type', logo.mimeType);
    response.send(logo.buffer);
  }

  @Delete('branding/logo')
  @HttpCode(HttpStatus.OK)
  @RequiresActiveSubscription()
  @OrganizationRoles(OrganizationRole.OWNER, OrganizationRole.ADMIN)
  removeLogo(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentUser() user: AuthUser,
  ) {
    return this.branding.removeLogo(organization, user.id);
  }
}
