import { IsInt, IsUUID, Max, Min } from 'class-validator';

export class RequestDiscountedInvoiceDto {
  @IsUUID()
  invoiceId!: string;

  @IsInt()
  @Min(2)
  @Max(5)
  termYears!: number;
}
