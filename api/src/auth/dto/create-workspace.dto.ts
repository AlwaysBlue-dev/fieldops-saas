import { Transform } from 'class-transformer';
import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { cleanOrganizationDisplayName } from '../../common/organization-name.js';

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
  @Matches(/^[A-Za-z_]+\/[A-Za-z_]+$/, {
    message: 'Choose a valid timezone.',
  })
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
