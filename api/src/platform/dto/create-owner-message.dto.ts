import { IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { OWNER_MESSAGE_CATEGORIES } from '../../common/constants.js';

export class CreateOwnerMessageDto {
  @IsUUID()
  organizationId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  subject!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(8000)
  message!: string;

  @IsIn([...OWNER_MESSAGE_CATEGORIES])
  category!: (typeof OWNER_MESSAGE_CATEGORIES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(80)
  ctaLabel?: string;

  /**
   * Safe internal FieldKeel app path (no scheme). Example: `/settings/billing`
   * Resolved under `/app/{orgSlug}` on the client.
   */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  ctaPath?: string;
}
