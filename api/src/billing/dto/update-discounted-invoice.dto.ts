import { IsInt, IsOptional, IsUrl, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class UpdateDiscountedInvoiceDto {
  @IsUUID()
  requestId!: string;

  @IsInt()
  @Min(2)
  @Max(5)
  termYears!: number;

  @IsOptional()
  @IsUrl({ require_protocol: true, protocols: ['https'] })
  @MaxLength(2000)
  paymentUrl?: string;
}
