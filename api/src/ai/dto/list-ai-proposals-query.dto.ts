import { IsIn, IsOptional } from 'class-validator';
import { AiProposedActionStatus } from '../../generated/prisma/client.js';

export class ListAiProposalsQueryDto {
  @IsOptional()
  @IsIn(['mine', 'review'])
  scope?: 'mine' | 'review';

  @IsOptional()
  @IsIn(Object.values(AiProposedActionStatus))
  status?: AiProposedActionStatus;
}
