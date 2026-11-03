import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateAiSessionDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;
}
