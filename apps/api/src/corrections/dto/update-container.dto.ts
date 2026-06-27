import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UpdateContainerDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  containerNo?: string;

  @IsOptional()
  @IsString()
  dockNo?: string | null;

  @IsOptional()
  @IsString()
  company?: string | null;

  @IsOptional()
  @IsString()
  reason?: string | null;

  @IsOptional()
  @IsString()
  correctionNote?: string | null;

  @IsOptional()
  @IsString()
  correctedById?: string | null;
}
