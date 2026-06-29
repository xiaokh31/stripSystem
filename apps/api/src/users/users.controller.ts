import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { CurrentUser, RequirePermissions } from '../auth/auth.decorators';
import type { AuthenticatedUser } from '../auth/auth-user';
import { ROUTE_PERMISSIONS } from '../auth/route-permissions';
import { CreateUserDto } from './dto/create-user.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { UpdateUserRolesDto } from './dto/update-user-roles.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import {
  UserListResponseDto,
  UserMutationResponseDto,
  UserResponseDto,
} from './dto/user-response.dto';
import { UsersService } from './users.service';

@Controller('users')
@RequirePermissions(...ROUTE_PERMISSIONS.users.manage)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  listUsers(): Promise<UserListResponseDto> {
    return this.usersService.listUsers();
  }

  @Post()
  createUser(
    @Body() dto: CreateUserDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<UserMutationResponseDto> {
    return this.usersService.createUser(dto, actor);
  }

  @Get(':id')
  getUser(@Param('id') id: string): Promise<UserResponseDto> {
    return this.usersService.getUser(id);
  }

  @Patch(':id')
  updateUser(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<UserMutationResponseDto> {
    return this.usersService.updateUser(id, dto, actor);
  }

  @Post(':id/reset-password')
  resetPassword(
    @Param('id') id: string,
    @Body() dto: ResetPasswordDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<UserMutationResponseDto> {
    return this.usersService.resetPassword(id, dto, actor);
  }

  @Patch(':id/roles')
  updateRoles(
    @Param('id') id: string,
    @Body() dto: UpdateUserRolesDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<UserMutationResponseDto> {
    return this.usersService.updateRoles(id, dto, actor);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateUserStatusDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<UserMutationResponseDto> {
    return this.usersService.updateStatus(id, dto, actor);
  }
}
