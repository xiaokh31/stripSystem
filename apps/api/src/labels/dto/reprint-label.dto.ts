import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class ReprintLabelDto {
  @IsString()
  @IsNotEmpty()
  operatorId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;

  @IsOptional()
  @IsBoolean()
  supervisorOverride?: boolean;
}
