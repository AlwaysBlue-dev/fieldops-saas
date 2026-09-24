import {
  IsDateString,
  IsEmail,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateInvoicePaymentDto {
  @IsOptional()
  @IsString()
  @IsUrl({ require_protocol: true, protocols: ['https'] })
  @MaxLength(2000)
  paymentUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  externalReference?: string;

  @IsOptional()
  @IsDateString()
  dueAt?: string;

  /** Billing contact snapshot — editable only while invoice is preparing. */
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  customerName?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(200)
  customerBillingEmail?: string;
}
