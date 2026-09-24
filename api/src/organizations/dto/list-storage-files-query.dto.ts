import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ListStorageFilesQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsIn(['PHOTO', 'DOCUMENT', 'SIGNATURE', 'OTHER', 'BRANDING'])
  category?: 'PHOTO' | 'DOCUMENT' | 'SIGNATURE' | 'OTHER' | 'BRANDING';

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;

  @IsOptional()
  @IsIn(['createdAt', 'sizeBytes', 'originalName'])
  sort?: 'createdAt' | 'sizeBytes' | 'originalName';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  order?: 'asc' | 'desc';
}
