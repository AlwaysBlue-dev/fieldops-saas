import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsOptional,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';

export class ExtendTrialDto {
  @ValidateIf((dto: ExtendTrialDto) => !dto.trialEndsAt)
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(90)
  days?: number;

  /** Absolute trial end (UTC date or ISO). Takes precedence over days when set. */
  @IsOptional()
  @IsDateString()
  trialEndsAt?: string;
}
