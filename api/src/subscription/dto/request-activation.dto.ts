import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RequestActivationDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  message?: string;
}
