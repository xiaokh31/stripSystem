import { IsArray, IsOptional, IsString } from 'class-validator';

export class UpdateRolePermissionsDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permissionIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permissionCodes?: string[];
}
