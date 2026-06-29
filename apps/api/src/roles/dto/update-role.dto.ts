import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdateRoleDto {
  @IsOptional()
  @IsString()
  displayName?: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
