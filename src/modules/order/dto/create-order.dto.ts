import { IsInt, IsPositive, IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class CreateOrderDto {
  @IsInt()
  @IsPositive()
  userId: number;

  @IsInt()
  @IsPositive()
  planId: number;

  @IsInt()
  @IsPositive()
  amount: number;

  @IsString()
  @IsNotEmpty()
  paymentReceiptFileId: string;

  @IsOptional()
  @IsInt()
  discountCodeId?: number | null;
}
