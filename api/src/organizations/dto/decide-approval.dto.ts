import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
  IsOptional,
} from 'class-validator';

export const APPROVAL_DECISIONS = [
  'APPROVED',
  'RETURNED',
  'REJECTED',
] as const;

export class DecideApprovalDto {
  @IsIn(APPROVAL_DECISIONS)
  decision!: (typeof APPROVAL_DECISIONS)[number];

  @ValidateIf(
    (dto: DecideApprovalDto) =>
      dto.decision === 'RETURNED' || dto.decision === 'REJECTED',
  )
  @IsString()
  @MinLength(4)
  @MaxLength(2000)
  comment?: string;
}

export class ListApprovalsQueryDto {
  @IsOptional()
  @IsIn(['JOB_COMPLETION', 'TIMESHEET', 'OVERTIME'])
  type?: 'JOB_COMPLETION' | 'TIMESHEET' | 'OVERTIME';

  @IsOptional()
  @IsIn(['PENDING', 'APPROVED', 'RETURNED', 'REJECTED', 'CANCELLED'])
  status?: string;
}

export class BulkTimesheetApprovalsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsUUID('4', { each: true })
  @Type(() => String)
  approvalIds!: string[];
}
