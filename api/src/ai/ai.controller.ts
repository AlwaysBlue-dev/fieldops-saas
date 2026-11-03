import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { OrganizationRole } from '../generated/prisma/client.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RequiresActiveSubscription } from '../subscription/requires-active-subscription.decorator.js';
import { CurrentOrganization } from '../tenancy/current-organization.decorator.js';
import { CurrentUser } from '../tenancy/current-user.decorator.js';
import { OrganizationMembershipGuard } from '../tenancy/organization-membership.guard.js';
import { OrganizationRoles } from '../tenancy/organization-roles.decorator.js';
import { OrganizationRolesGuard } from '../tenancy/organization-roles.guard.js';
import type {
  AuthUser,
  OrganizationContext,
} from '../tenancy/request-context.js';
import { AiService } from './ai.service.js';
import { CreateAiSessionDto } from './dto/create-ai-session.dto.js';
import { DecideAiProposalDto } from './dto/decide-ai-proposal.dto.js';
import { SendAiMessageDto } from './dto/send-ai-message.dto.js';
import { UpdateAiSessionDto } from './dto/update-ai-session.dto.js';

@Controller('organizations/:organizationId/ai')
/**
 * Decorator order matters (TS applies class decorators bottom-up; Nest appends
 * UseGuards). Subscription must register *after* JWT + membership so
 * `request.organization` exists before SubscriptionAccessGuard runs.
 */
@RequiresActiveSubscription()
@UseGuards(JwtAuthGuard, OrganizationMembershipGuard, OrganizationRolesGuard)
@OrganizationRoles(
  OrganizationRole.OWNER,
  OrganizationRole.ADMIN,
  OrganizationRole.OPERATIONS_MANAGER,
  OrganizationRole.SUPERVISOR,
)
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Post('sessions')
  @HttpCode(HttpStatus.CREATED)
  createSession(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateAiSessionDto,
  ) {
    return this.ai.createSession(organization, user.id, dto.title);
  }

  @Get('sessions')
  listSessions(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentUser() user: AuthUser,
  ) {
    return this.ai.listSessions(organization, user.id);
  }

  @Get('sessions/:sessionId')
  getSession(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentUser() user: AuthUser,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
  ) {
    return this.ai.getSession(organization, user.id, sessionId);
  }

  @Patch('sessions/:sessionId')
  renameSession(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentUser() user: AuthUser,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Body() dto: UpdateAiSessionDto,
  ) {
    return this.ai.renameSession(organization, user.id, sessionId, dto.title);
  }

  @Delete('sessions/:sessionId')
  @HttpCode(HttpStatus.OK)
  deleteSession(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentUser() user: AuthUser,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
  ) {
    return this.ai.deleteSession(organization, user.id, sessionId);
  }

  @Post('sessions/:sessionId/messages')
  @HttpCode(HttpStatus.CREATED)
  sendMessage(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentUser() user: AuthUser,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Body() dto: SendAiMessageDto,
  ) {
    return this.ai.sendMessage(
      organization,
      user.id,
      sessionId,
      dto.content,
      dto.clientRequestId,
    );
  }

  @Get('usage')
  usage(@CurrentOrganization() organization: OrganizationContext) {
    return this.ai.getUsage(organization);
  }

  @Get('proposals')
  listProposals(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentUser() user: AuthUser,
  ) {
    return this.ai.listProposals(organization, user.id);
  }

  @Post('proposals/:proposalId/decide')
  @HttpCode(HttpStatus.OK)
  decideProposal(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentUser() user: AuthUser,
    @Param('proposalId', ParseUUIDPipe) proposalId: string,
    @Body() dto: DecideAiProposalDto,
  ) {
    return this.ai.decideProposal(
      organization,
      user.id,
      proposalId,
      dto.decision,
      dto.comment,
    );
  }
}
