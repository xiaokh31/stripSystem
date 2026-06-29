import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { CurrentUser, RequirePermissions } from '../auth/auth.decorators';
import type { AuthenticatedUser } from '../auth/auth-user';
import { ROUTE_PERMISSIONS } from '../auth/route-permissions';
import { CreateRoleDto } from './dto/create-role.dto';
import {
  PermissionListResponseDto,
  RoleListResponseDto,
  RoleMutationResponseDto,
  RoleResponseDto,
} from './dto/role-response.dto';
import { UpdateRolePermissionsDto } from './dto/update-role-permissions.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { RolesService } from './roles.service';

@Controller('roles')
@RequirePermissions(...ROUTE_PERMISSIONS.roles.manage)
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  listRoles(): Promise<RoleListResponseDto> {
    return this.rolesService.listRoles();
  }

  @Post()
  createRole(
    @Body() dto: CreateRoleDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<RoleMutationResponseDto> {
    return this.rolesService.createRole(dto, actor);
  }

  @Get(':id')
  getRole(@Param('id') id: string): Promise<RoleResponseDto> {
    return this.rolesService.getRole(id);
  }

  @Patch(':id')
  updateRole(
    @Param('id') id: string,
    @Body() dto: UpdateRoleDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<RoleMutationResponseDto> {
    return this.rolesService.updateRole(id, dto, actor);
  }

  @Patch(':id/permissions')
  updateRolePermissions(
    @Param('id') id: string,
    @Body() dto: UpdateRolePermissionsDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<RoleMutationResponseDto> {
    return this.rolesService.updateRolePermissions(id, dto, actor);
  }
}

@Controller('permissions')
@RequirePermissions(...ROUTE_PERMISSIONS.permissions.manage)
export class PermissionsController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  listPermissions(): Promise<PermissionListResponseDto> {
    return this.rolesService.listPermissions();
  }
}
