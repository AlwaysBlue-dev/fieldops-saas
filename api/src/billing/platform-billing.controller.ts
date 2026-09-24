import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
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
import { ListInvoicesQueryDto } from './dto/list-invoices-query.dto.js';
import { UpdateBillingSettingsDto } from './dto/update-billing-settings.dto.js';
import { UpdateInvoicePaymentDto } from './dto/update-invoice-payment.dto.js';
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
  list(@Query() query: ListInvoicesQueryDto) {
    return this.invoices.listPlatform(query);
  }

  @Post('invoices')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateInvoiceDto) {
    return this.invoices.create(user.id, dto);
  }

  @Get('invoices/:invoiceId')
  get(@Param('invoiceId') invoiceId: string) {
    return this.invoices.getPlatform(invoiceId);
  }

  @Patch('invoices/:invoiceId/payment')
  updatePayment(
    @Param('invoiceId') invoiceId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateInvoicePaymentDto,
  ) {
    return this.invoices.updatePaymentDetails(invoiceId, user.id, dto);
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

  @Post('invoices/:invoiceId/mark-paid-activate')
  @HttpCode(HttpStatus.OK)
  markPaidActivate(
    @Param('invoiceId') invoiceId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.invoices.markPaidAndActivate(invoiceId, user.id);
  }

  @Post('invoices/:invoiceId/mark-paid-renew')
  @HttpCode(HttpStatus.OK)
  markPaidRenew(
    @Param('invoiceId') invoiceId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.invoices.markPaidAndRenew(invoiceId, user.id);
  }

  @Post('invoices/:invoiceId/mark-overdue')
  @HttpCode(HttpStatus.OK)
  markOverdue(
    @Param('invoiceId') invoiceId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.invoices.markOverdue(invoiceId, user.id);
  }

  @Post('invoices/:invoiceId/payment-not-found')
  @HttpCode(HttpStatus.OK)
  paymentNotFound(
    @Param('invoiceId') invoiceId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.invoices.markPaymentNotFound(invoiceId, user.id);
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
