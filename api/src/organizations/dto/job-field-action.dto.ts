import { Type } from 'class-transformer';
import {
  IsBoolean,
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

export class CreateWorkLogDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  body?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  text?: string;
}

export class CreateJobMaterialDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  itemName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  partNumber?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.001)
  quantity!: number;

  @IsIn(MATERIAL_UNITS)
  unit!: (typeof MATERIAL_UNITS)[number];

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(400)
  notes?: string;
}

export class CreateJobPhotoDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  fileName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  mimeType!: string;

  @IsString()
  @MinLength(8)
  contentBase64!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  caption?: string;

  @IsOptional()
  @IsString()
  capturedAt?: string;
}

export class CreateJobSignatureDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  signerName?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  representativeName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  signerTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  representativeRole?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  clientComments?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  clientAccepted?: boolean;

  @IsString()
  @MinLength(8)
  imageBase64!: string;
}
