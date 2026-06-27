import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CloseLoadJobDto {
  @IsOptional()
  @IsString()
  operatorId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
