import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class CreateOvertimeAuthorizationDto {
  @IsUUID()
  jobId!: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  workDate!: string;

  @Matches(/^\d{2}:\d{2}(:\d{2})?$/)
  startTime!: string;

  @Matches(/^\d{2}:\d{2}(:\d{2})?$/)
  endTime!: string;

  @Type(() => Number)
  @IsInt()
  @Min(15)
  @Max(24 * 60)
  maxMinutes!: number;

  @IsString()
  @MinLength(8)
  @MaxLength(4000)
  reason!: string;

  @IsOptional()
  @IsUUID()
  userId?: string;
}

export class ListOvertimeQueryDto {
  @IsOptional()
  @IsIn(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'])
  status?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @Type(() => Number)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  pageSize?: number;
}

export class DecideOvertimeDto {
  @IsIn(['APPROVED', 'REJECTED'])
  decision!: 'APPROVED' | 'REJECTED';

  @ValidateIf((dto: DecideOvertimeDto) => dto.decision === 'REJECTED')
  @IsString()
  @MinLength(4)
  @MaxLength(2000)
  comment?: string;
}
