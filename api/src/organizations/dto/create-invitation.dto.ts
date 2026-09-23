import { Transform } from 'class-transformer';
import { IsEmail, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { OrganizationRole } from '../../generated/prisma/client.js';

export class CreateInvitationDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  email!: string;

  @IsEnum(OrganizationRole)
  role!: OrganizationRole;

  @IsOptional()
  @IsUUID()
  teamId?: string;
}
