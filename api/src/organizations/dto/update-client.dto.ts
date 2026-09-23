import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { EntityStatus } from '../../generated/prisma/client.js';

function trimToUndefined(value: unknown) {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

export class UpdateClientDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @Transform(({ value }) => trimToUndefined(value))
  @IsString()
  @MaxLength(40)
  clientCode?: string;

  @IsOptional()
  @Transform(({ value }) => trimToUndefined(value))
  @IsString()
  @MaxLength(120)
  primaryContactName?: string;

  @IsOptional()
  @Transform(({ value }) => trimToUndefined(value))
  @IsEmail()
  @MaxLength(160)
  primaryContactEmail?: string;

  @IsOptional()
  @Transform(({ value }) => trimToUndefined(value))
  @IsString()
  @MinLength(7)
  @MaxLength(40)
  primaryContactPhone?: string;

  @IsOptional()
  @Transform(({ value }) => trimToUndefined(value))
  @IsEmail()
  @MaxLength(160)
  billingEmail?: string;

  @IsOptional()
  @Transform(({ value }) => trimToUndefined(value))
  @IsString()
  @MaxLength(200)
  website?: string;

  @IsOptional()
  @Transform(({ value }) => trimToUndefined(value))
  @IsString()
  @MaxLength(4000)
  notes?: string;

  @IsOptional()
  @IsEnum(EntityStatus)
  status?: EntityStatus;
}
