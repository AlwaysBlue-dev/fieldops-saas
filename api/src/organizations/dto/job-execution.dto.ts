import { Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { MATERIAL_UNITS } from '../../common/constants.js';
import { JobOutcome } from '../../generated/prisma/client.js';

export class ConfirmSafetyControlDto {
  @IsOptional()
  @IsString()
  @MaxLength(400)
  note?: string;
}

export class UpdateJobClientContactDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  representativeName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  representativeRole?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  representativePhone?: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== '')
  @IsString()
  @MaxLength(160)
  representativeEmail?: string;
}

export class UpdateCompletionSummaryDto {
  @IsString()
  @MinLength(8)
  @MaxLength(8000)
  workPerformed!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  completionNotes?: string;

  @IsEnum(JobOutcome)
  outcome!: JobOutcome;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  outcomeReason?: string;
}

export class UpdateWorkLogDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  text!: string;
}

export class UpdateJobMaterialDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  itemName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  partNumber?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.001)
  quantity?: number;

  @IsOptional()
  @IsIn(MATERIAL_UNITS)
  unit?: (typeof MATERIAL_UNITS)[number];

  @IsOptional()
  @IsString()
  @MaxLength(400)
  notes?: string;
}
