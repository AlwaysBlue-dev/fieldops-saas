import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { EntityStatus } from '../../generated/prisma/client.js';

function trimToUndefined(value: unknown) {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

export class UpdateTeamDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @Transform(({ value }) => trimToUndefined(value))
  @IsString()
  @MaxLength(40)
  code?: string | null;

  @IsOptional()
  @Transform(({ value }) => trimToUndefined(value))
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  supervisorUserId?: string | null;

  @IsOptional()
  @IsEnum(EntityStatus)
  status?: EntityStatus;
}

export class AssignTeamMemberDto {
  @IsUUID()
  userId!: string;
}

export class AssignSupervisorDto {
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  supervisorUserId!: string | null;
}
