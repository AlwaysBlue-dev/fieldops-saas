import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsOptional,
  IsUUID,
  ValidateIf,
} from 'class-validator';

export class ScheduleJobDto {
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
  @Type(() => Boolean)
  @IsBoolean()
  confirmOverlap?: boolean;
}
