import { IsEnum, IsIn, IsOptional, IsUUID, Matches } from 'class-validator';
import { JobPriority, JobStatus } from '../../generated/prisma/client.js';

export class ScheduleQueryDto {
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date?: string;

  @IsOptional()
  @IsIn(['day', 'week'])
  range?: 'day' | 'week';

  @IsOptional()
  @IsUUID()
  teamId?: string;

  @IsOptional()
  @IsUUID()
  technicianId?: string;

  @IsOptional()
  @IsUUID()
  clientId?: string;

  @IsOptional()
  @IsEnum(JobStatus)
  status?: JobStatus;

  @IsOptional()
  @IsEnum(JobPriority)
  priority?: JobPriority;
}
