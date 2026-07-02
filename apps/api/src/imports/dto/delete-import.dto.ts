import { IsOptional, IsString, MaxLength } from 'class-validator';

export class DeleteImportDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
