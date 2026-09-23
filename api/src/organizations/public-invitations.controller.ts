import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { setAuthCookies } from '../auth/auth-cookies.js';
import { JwtOptionalGuard } from '../auth/jwt-optional.guard.js';
import type { EnvironmentVariables } from '../config/env.js';
import type { AuthenticatedRequest } from '../tenancy/request-context.js';
import { AcceptInvitationDto } from './dto/accept-invitation.dto.js';
import { InvitationsService } from './invitations.service.js';

@Controller('invitations')
export class PublicInvitationsController {
  constructor(
    private readonly invitations: InvitationsService,
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  @Get(':token')
  preview(@Param('token') token: string) {
    return this.invitations.preview(token);
  }

  @Post(':token/accept')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseGuards(JwtOptionalGuard)
  async accept(
    @Param('token') token: string,
    @Body() dto: AcceptInvitationDto,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { accessToken, refreshToken, ...body } = await this.invitations.accept(
      token,
      dto,
      request,
      request.user,
    );
    setAuthCookies(response, this.config, accessToken, refreshToken);
    return body;
  }
}
