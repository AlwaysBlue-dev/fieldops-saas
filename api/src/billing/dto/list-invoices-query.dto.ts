import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const SORT_FIELDS = [
  'createdAt',
  'issuedAt',
  'dueAt',
  'paidAt',
  'invoiceNumber',
  'totalCents',
  'status',
] as const;

const INVOICE_STATUSES = [
  'DRAFT',
  'PREPARING',
  'ISSUED',
  'PAYMENT_REPORTED',
  'PAID',
  'OVERDUE',
  'VOID',
] as const;

const INVOICE_TYPES = [
  'ACTIVATION',
  'RENEWAL',
  'PLAN_CHANGE',
  'OTHER',
] as const;

export class ListInvoicesQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @IsIn([...INVOICE_STATUSES])
  status?: (typeof INVOICE_STATUSES)[number];

  @IsOptional()
  @IsUUID()
  organizationId?: string;

  @IsOptional()
  @IsIn([...INVOICE_TYPES])
  invoiceType?: (typeof INVOICE_TYPES)[number];

  @IsOptional()
  @IsUUID()
  planId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  planCode?: string;

  @IsOptional()
  @IsIn([...SORT_FIELDS])
  sortBy?: (typeof SORT_FIELDS)[number];

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';
}
