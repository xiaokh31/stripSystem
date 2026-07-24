import { Body, Controller, Get, Param, Patch, Post, Req } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { CurrentUser, RequirePermissions } from '../auth/auth.decorators';
import type { AuthenticatedUser } from '../auth/auth-user';
import { DistributedAuthRateLimiter } from '../auth/distributed-auth-rate-limiter.service';
import { ROUTE_PERMISSIONS } from '../auth/route-permissions';
import { canonicalClientAddress } from '../common/trusted-proxy';
import type { PublicDeploymentConfiguration } from '../config/public-deployment.config';
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
  constructor(
    private readonly usersService: UsersService,
    private readonly rateLimiter: DistributedAuthRateLimiter,
    private readonly configService: ConfigService,
  ) {}

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
  async resetPassword(
    @Param('id') id: string,
    @Body() dto: ResetPasswordDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<UserMutationResponseDto> {
    const clientAddress = canonicalClientAddress(request, this.configuration);
    await this.rateLimiter.assertAllowed(
      'password-recovery',
      `${clientAddress ?? 'unknown'}:${actor.id}:${id}`,
    );
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

  private get configuration(): PublicDeploymentConfiguration {
    const value = this.configService.get<PublicDeploymentConfiguration>(
      'app.publicDeployment',
    );
    if (!value) throw new Error('TYPED_PUBLIC_CONFIG_REQUIRED');
    return value;
  }
}
