import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class DecideAiProposalDto {
  @IsIn(['APPROVE', 'REJECT'])
  decision!: 'APPROVE' | 'REJECT';

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}
