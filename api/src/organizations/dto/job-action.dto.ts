import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CancelJobDto {
  @IsOptional()
  @IsString()
  @MaxLength(400)
  reason?: string;
}

export class ReturnJobDto {
  @IsString()
  @MinLength(4)
  @MaxLength(400)
  reason!: string;
}
