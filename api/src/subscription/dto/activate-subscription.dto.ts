import { IsDateString, IsOptional, IsString, IsUUID } from 'class-validator';

export class ActivateSubscriptionDto {
  @IsOptional()
  @IsUUID()
  planId?: string;

  @IsOptional()
  @IsString()
  planCode?: string;

  @IsDateString()
  currentPeriodStart!: string;

  @IsDateString()
  currentPeriodEnd!: string;
}
