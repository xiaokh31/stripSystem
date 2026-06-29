import { ArrayMinSize, IsArray, IsOptional, IsString } from 'class-validator';

export class UpdateUserRolesDto {
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
