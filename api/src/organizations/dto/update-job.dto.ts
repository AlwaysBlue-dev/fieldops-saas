import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { JOB_TYPES } from '../../common/constants.js';
import { JobPriority } from '../../generated/prisma/client.js';

export class UpdateJobDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsUUID()
  clientId?: string;

  @IsOptional()
  @IsUUID()
  siteId?: string;

  @IsOptional()
  @IsIn(JOB_TYPES)
  jobType?: (typeof JOB_TYPES)[number];

  @IsOptional()
  @IsEnum(JobPriority)
  priority?: JobPriority;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsDateString()
  scheduledStart?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsDateString()
  expectedFinish?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  teamId?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  supervisorUserId?: string | null;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  technicianUserIds?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(80)
  workOrderNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  scope?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  internalNotes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  clientRepName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  clientRepTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  clientRepPhone?: string;

  @IsOptional()
  @ValidateIf((_, value) => Boolean(value))
  @IsEmail()
  @MaxLength(160)
  clientRepEmail?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  requireRiskAssessment?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  requirePermit?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  requireLoto?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  requireClientSignOff?: boolean;
}
