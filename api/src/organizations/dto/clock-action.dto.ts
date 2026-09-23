import { Type } from 'class-transformer';
import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class GpsEvidenceDto {
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
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(10000)
  accuracyMeters?: number;
}

export class ClockInDto extends GpsEvidenceDto {
  @IsOptional()
  @IsUUID()
  jobId?: string;

  @IsOptional()
  @IsDateString()
  clientOccurredAt?: string;
}

export class ClockOutDto extends GpsEvidenceDto {
  @IsOptional()
  @IsDateString()
  clientOccurredAt?: string;
}
