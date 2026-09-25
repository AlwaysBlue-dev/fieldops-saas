import { Transform } from 'class-transformer';
import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  Validate,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';
import { cleanOrganizationDisplayName } from '../../common/organization-name.js';
import { isValidIanaTimeZone } from '../../common/timezone.js';

@ValidatorConstraint({ name: 'isIanaTimeZone', async: false })
export class IsIanaTimeZoneConstraint implements ValidatorConstraintInterface {
  validate(value: unknown) {
    return typeof value === 'string' && isValidIanaTimeZone(value);
  }

  defaultMessage() {
    return 'Please select a valid timezone.';
  }
}

const WORKSPACE_PLAN_CODES = ['starter', 'professional', 'business'] as const;

export class CreateWorkspaceDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? cleanOrganizationDisplayName(value) : value,
  )
  @IsString()
  @IsNotEmpty({ message: 'Enter your company name.' })
  @MinLength(2, { message: 'Company name must be at least 2 characters.' })
  @MaxLength(120, { message: 'Company name must be 120 characters or fewer.' })
  organizationName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Validate(IsIanaTimeZoneConstraint)
  timezone?: string;

  /**
   * Required when the account has already used its free trial.
   * Ignored for the first trial workspace (always Professional trial).
   */
  @IsOptional()
  @IsString()
  @IsIn([...WORKSPACE_PLAN_CODES], {
    message: 'Choose Starter, Professional, or Business.',
  })
  planCode?: (typeof WORKSPACE_PLAN_CODES)[number];
}
