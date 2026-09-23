import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { JobFileType } from '../../generated/prisma/client.js';

export class UploadJobFileDto {
  @IsOptional()
  @IsIn([JobFileType.PHOTO, JobFileType.DOCUMENT, JobFileType.OTHER])
  category?: JobFileType;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  caption?: string;

  @IsOptional()
  @IsDateString()
  capturedAt?: string;
}

export class CreateJobSignOffDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  representativeName?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  signerName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  representativeRole?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  signerTitle?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  clientAccepted?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  clientComments?: string;

  @IsString()
  @MinLength(8)
  imageBase64!: string;
}
