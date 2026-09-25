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
  MinLength,
  Validate,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';
import { cleanOrganizationDisplayName } from '../../common/organization-name.js';
import { isValidIanaTimeZone } from '../../common/timezone.js';

@ValidatorConstraint({ name: 'isIanaTimeZone', async: false })
class IsIanaTimeZoneConstraint implements ValidatorConstraintInterface {
  validate(value: unknown) {
    return typeof value === 'string' && isValidIanaTimeZone(value);
  }

  defaultMessage() {
    return 'Please select a valid timezone.';
  }
}

export class UpdateOrganizationDto {
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? cleanOrganizationDisplayName(value) : value,
  )
  @IsString()
  @MinLength(2, { message: 'Company name must be at least 2 characters.' })
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  industry?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Validate(IsIanaTimeZoneConstraint)
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
