import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateBillingSettingsDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  billingLegalName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  billingAddress?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  billingEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  billingInstructions?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  paymentReferenceInstructions?: string;
}
