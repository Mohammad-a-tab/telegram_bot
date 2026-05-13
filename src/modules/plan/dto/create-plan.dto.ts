import { IsString, IsInt, IsPositive, IsEnum, IsOptional, IsBoolean, Min, MinLength, MaxLength } from 'class-validator';
import { BandwidthUnit } from '../../../common/enums';

export class CreatePlanDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @IsString()
  @MinLength(5)
  @MaxLength(500)
  description: string;

  @IsInt()
  @IsPositive()
  price: number;

  @IsInt()
  @IsPositive()
  duration_days: number;

  @IsInt()
  @Min(0)
  bandwidth_value: number;

  @IsEnum(BandwidthUnit)
  bandwidth_unit: BandwidthUnit;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
