import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class ReverseScanDto {
  @IsString()
  @IsNotEmpty()
  palletRecordId!: string;

  @IsBoolean()
  confirm!: boolean;

  @IsString()
  @IsNotEmpty()
  @MaxLength(240)
  reason!: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  deviceId?: string;

  @IsOptional()
  @IsString()
  operatorId?: string;
}
