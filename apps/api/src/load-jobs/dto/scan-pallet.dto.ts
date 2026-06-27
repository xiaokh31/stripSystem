import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class ScanPalletDto {
  @IsString()
  @IsNotEmpty()
  qrPayload!: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  deviceId?: string;

  @IsOptional()
  @IsString()
  operatorId?: string;
}
