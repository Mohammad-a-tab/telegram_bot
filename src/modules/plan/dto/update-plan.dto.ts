import { IsString, IsInt, IsPositive, IsEnum, IsOptional, IsBoolean, Min, MinLength, MaxLength } from 'class-validator';
import { BandwidthUnit } from '../../../common/enums';

export class UpdatePlanDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsInt()
  @IsPositive()
  price?: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  duration_days?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  bandwidth_value?: number;

  @IsOptional()
  @IsEnum(BandwidthUnit)
  bandwidth_unit?: BandwidthUnit;

  @IsOptional()
  @IsInt()
  @Min(0)
  stock?: number;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
