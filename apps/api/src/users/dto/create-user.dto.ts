import {
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class CreateUserDto {
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  name?: string | null;

  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  password!: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  roleIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  roleCodes?: string[];
}
