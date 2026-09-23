import { IsIn } from 'class-validator';
import { ActivationRequestStatus } from '../../generated/prisma/client.js';

export class UpdateCommercialRequestDto {
  @IsIn([
    ActivationRequestStatus.CONTACTED,
    ActivationRequestStatus.COMPLETED,
    ActivationRequestStatus.CLOSED,
  ])
  status!: 'CONTACTED' | 'COMPLETED' | 'CLOSED';
}
