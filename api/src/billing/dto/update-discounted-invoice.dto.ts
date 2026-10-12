import { IsInt, IsUUID, Max, Min } from 'class-validator';

export class UpdateDiscountedInvoiceDto {
  @IsUUID()
  requestId!: string;

  @IsInt()
  @Min(2)
  @Max(5)
  termYears!: number;
}
