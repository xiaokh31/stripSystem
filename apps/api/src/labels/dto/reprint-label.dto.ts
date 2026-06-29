import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class ReprintLabelDto {
  @IsOptional()
  @IsString()
  operatorId?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;

  @IsOptional()
  @IsBoolean()
  supervisorOverride?: boolean;
}
