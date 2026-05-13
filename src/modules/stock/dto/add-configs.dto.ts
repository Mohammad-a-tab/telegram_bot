import { IsInt, IsPositive, IsString, IsNotEmpty } from 'class-validator';

export class AddConfigsDto {
  @IsInt()
  @IsPositive()
  planId: number;

  @IsString()
  @IsNotEmpty()
  input: string;
}
