import { Type } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  Validate,
} from 'class-validator';
import { IsValidIanaTimeZone } from '../../common/timezone.js';
import { EntityStatus } from '../../generated/prisma/client.js';

export class UpdateSiteDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  siteCode?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  addressLine1?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  addressLine2?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  stateRegion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(24)
  postalCode?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  country?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  @Validate(IsValidIanaTimeZone)
  timezone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  siteContactName?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(160)
  siteContactEmail?: string;

  @IsOptional()
  @IsString()
  @MinLength(7)
  @MaxLength(40)
  siteContactPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;

  @IsOptional()
  @IsEnum(EntityStatus)
  status?: EntityStatus;
}
