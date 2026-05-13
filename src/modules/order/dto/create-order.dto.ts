import { IsInt, IsPositive, IsString, IsNotEmpty } from 'class-validator';

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
}
