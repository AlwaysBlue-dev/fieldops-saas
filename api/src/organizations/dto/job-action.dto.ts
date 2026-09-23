import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CancelJobDto {
  @IsOptional()
  @IsString()
  @MaxLength(400)
  reason?: string;
}

export class ReturnJobDto {
  @IsOptional()
  @IsString()
  @MaxLength(400)
  reason?: string;
}
