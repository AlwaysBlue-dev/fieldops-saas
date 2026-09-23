import { IsEnum, IsOptional } from 'class-validator';
import {
  MembershipStatus,
  OrganizationRole,
} from '../../generated/prisma/client.js';

export class UpdateMemberDto {
  @IsOptional()
  @IsEnum(OrganizationRole)
  role?: OrganizationRole;

  @IsOptional()
  @IsEnum(MembershipStatus)
  status?: MembershipStatus;
}
