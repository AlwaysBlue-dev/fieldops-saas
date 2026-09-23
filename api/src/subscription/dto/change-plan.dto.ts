import { IsOptional, IsString, IsUUID } from 'class-validator';

export class ChangePlanDto {
  @IsOptional()
  @IsUUID()
  planId?: string;

  @IsOptional()
  @IsString()
  planCode?: string;
}
