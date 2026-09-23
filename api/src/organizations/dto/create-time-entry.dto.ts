import { Type } from 'class-transformer';
import {
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export const TIME_ENTRY_TYPES = [
  'NORMAL',
  'OVERTIME',
  'TRAVEL',
  'STANDBY',
] as const;

export class CreateTimeEntryDto {
  @IsUUID()
  jobId!: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  workDate!: string;

  @IsIn(TIME_ENTRY_TYPES)
  type!: (typeof TIME_ENTRY_TYPES)[number];

  @Matches(/^\d{2}:\d{2}(:\d{2})?$/)
  startTime!: string;

  @Matches(/^\d{2}:\d{2}(:\d{2})?$/)
  endTime!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(4000)
  description!: string;

  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsUUID()
  overtimeAuthorizationId?: string;
}

export class UpdateTimeEntryDto {
  @IsOptional()
  @IsUUID()
  jobId?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  workDate?: string;

  @IsOptional()
  @IsIn(TIME_ENTRY_TYPES)
  type?: (typeof TIME_ENTRY_TYPES)[number];

  @IsOptional()
  @Matches(/^\d{2}:\d{2}(:\d{2})?$/)
  startTime?: string;

  @IsOptional()
  @Matches(/^\d{2}:\d{2}(:\d{2})?$/)
  endTime?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(4000)
  description?: string;

  @IsOptional()
  @IsUUID()
  overtimeAuthorizationId?: string;
}

export class ListTimesheetQueryDto {
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  weekStart?: string;

  @IsOptional()
  @IsUUID()
  userId?: string;
}

export class ListTimeEntriesQueryDto {
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  from?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  to?: string;

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

export class DecideTimeEntryDto {
  @IsIn(['APPROVED', 'RETURNED', 'REJECTED'])
  decision!: 'APPROVED' | 'RETURNED' | 'REJECTED';

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}
