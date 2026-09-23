import { Transform, Type } from 'class-transformer';
import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

function trimToUndefined(value: unknown) {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

export class OnboardingSiteDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  addressLine1?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  city?: string;
}

export class CreateClientDto {
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name!: string;

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
  @Transform(({ value }) => trimToUndefined(value))
  @IsEmail()
  @MaxLength(160)
  email?: string;

  @IsOptional()
  @Transform(({ value }) => trimToUndefined(value))
  @IsString()
  @MinLength(7)
  @MaxLength(40)
  phone?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => OnboardingSiteDto)
  site?: OnboardingSiteDto;
}
