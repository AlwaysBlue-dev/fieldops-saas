import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateOrganizationDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  industry?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z_]+\/[A-Za-z_]+$/, {
    message: 'timezone must be an IANA identifier such as America/Chicago',
  })
  timezone?: string;
}

export class UpdateOrganizationSettingsDto {
  @IsOptional()
  @IsString()
  @MaxLength(16)
  @Matches(/^[A-Za-z0-9-]+$/, {
    message: 'job number prefix may contain letters, numbers, and hyphens',
  })
  jobNumberPrefix?: string;

  @IsOptional()
  @Transform(({ value }) =>
    Array.isArray(value)
      ? value.map((day: unknown) => String(day).toUpperCase())
      : value,
  )
  workingWeek?: string[];

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(24)
  defaultDailyHoursLimit?: number;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  requireClientSignature?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  requireGps?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(25)
  @Max(5000)
  gpsReviewDistanceMeters?: number;
}
