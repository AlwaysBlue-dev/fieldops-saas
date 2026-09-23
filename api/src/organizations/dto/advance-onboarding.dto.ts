import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  UpdateOrganizationDto,
  UpdateOrganizationSettingsDto,
} from './update-organization.dto.js';

export class AdvanceOnboardingDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  step?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateOrganizationDto)
  profile?: UpdateOrganizationDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateOrganizationSettingsDto)
  settings?: UpdateOrganizationSettingsDto;

  @IsOptional()
  @IsBoolean()
  complete?: boolean;
}
