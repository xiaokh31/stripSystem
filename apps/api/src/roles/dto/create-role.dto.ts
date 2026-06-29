import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';

export class CreateRoleDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^[A-Z][A-Z0-9_]*$/)
  code!: string;

  @IsString()
  @IsNotEmpty()
  displayName!: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsBoolean()
  isSystem?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
