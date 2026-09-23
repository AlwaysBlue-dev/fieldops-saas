import { Type } from 'class-transformer';
import {
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateWorkLogDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  body!: string;
}

export class CreateJobMaterialDto {
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.001)
  quantity!: number;

  @IsString()
  @MinLength(1)
  @MaxLength(32)
  unit!: string;

  @IsOptional()
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
}

export class CreateJobSignatureDto {
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  signerName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  signerTitle?: string;

  @IsString()
  @MinLength(8)
  imageBase64!: string;
}
