import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { SuperAdminGuard } from '../platform/super-admin.guard.js';
import { CurrentUser } from '../tenancy/current-user.decorator.js';
import type { AuthUser } from '../tenancy/request-context.js';
import { BillingSettingsService } from './billing-settings.service.js';
import { CreateInvoiceDto } from './dto/create-invoice.dto.js';
import { UpdateBillingSettingsDto } from './dto/update-billing-settings.dto.js';
import { InvoiceService } from './invoice.service.js';

@Controller('platform')
@UseGuards(JwtAuthGuard, SuperAdminGuard)
export class PlatformBillingController {
  constructor(
    private readonly invoices: InvoiceService,
    private readonly settings: BillingSettingsService,
  ) {}

  @Get('billing-settings')
  getSettings() {
    return this.settings.get();
  }

  @Put('billing-settings')
  updateSettings(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateBillingSettingsDto,
  ) {
    return this.settings.update(user.id, dto);
  }

  @Get('invoices')
  list() {
    return this.invoices.listPlatform();
  }

  @Post('invoices')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateInvoiceDto) {
    return this.invoices.create(user.id, dto);
  }

  @Get('invoices/:invoiceId')
  get(@Param('invoiceId') invoiceId: string) {
    return this.invoices.getPlatform(invoiceId);
  }

  @Get('invoices/:invoiceId/pdf')
  async pdf(@Param('invoiceId') invoiceId: string, @Res() response: Response) {
    const { buffer, filename } = await this.invoices.pdfPlatform(invoiceId);
    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    response.send(buffer);
  }

  @Post('invoices/:invoiceId/issue')
  @HttpCode(HttpStatus.OK)
  issue(@Param('invoiceId') invoiceId: string, @CurrentUser() user: AuthUser) {
    return this.invoices.issue(invoiceId, user.id);
  }

  @Post('invoices/:invoiceId/mark-paid')
  @HttpCode(HttpStatus.OK)
  markPaid(@Param('invoiceId') invoiceId: string, @CurrentUser() user: AuthUser) {
    return this.invoices.markPaid(invoiceId, user.id);
  }

  @Post('invoices/:invoiceId/activate')
  @HttpCode(HttpStatus.OK)
  activate(@Param('invoiceId') invoiceId: string, @CurrentUser() user: AuthUser) {
    return this.invoices.activateFromInvoice(invoiceId, user.id);
  }

  @Post('invoices/:invoiceId/void')
  @HttpCode(HttpStatus.OK)
  void(@Param('invoiceId') invoiceId: string, @CurrentUser() user: AuthUser) {
    return this.invoices.void(invoiceId, user.id);
  }
}
