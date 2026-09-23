import { IsOptional, IsString, MaxLength } from 'class-validator';

export class PaymentNoticeDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  reference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  message?: string;
}
