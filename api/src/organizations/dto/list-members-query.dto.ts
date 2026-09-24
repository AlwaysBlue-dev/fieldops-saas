import { Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import {
  MembershipStatus,
  OrganizationRole,
} from '../../generated/prisma/client.js';

export class ListMembersQueryDto {
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
  @IsEnum(MembershipStatus)
  status?: MembershipStatus;

  @IsOptional()
  @IsString()
  roles?: string;

  @IsOptional()
  @IsIn(['fullName', 'email', 'role', 'joinedAt'])
  sort?: 'fullName' | 'email' | 'role' | 'joinedAt';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  order?: 'asc' | 'desc';
}

export function parseMemberRoles(raw?: string): OrganizationRole[] | undefined {
  if (!raw?.trim()) return undefined;
  const allowed = new Set(Object.values(OrganizationRole));
  const roles = [
    ...new Set(
      raw
        .split(',')
        .map((part) => part.trim().toUpperCase())
        .filter((part): part is OrganizationRole =>
          allowed.has(part as OrganizationRole),
        ),
    ),
  ];
  return roles.length ? roles : undefined;
}
