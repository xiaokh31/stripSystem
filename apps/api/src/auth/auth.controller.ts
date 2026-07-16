import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CurrentUser, Public, RequirePermissions } from './auth.decorators';
import { PERMISSIONS } from './permissions';
import type { AuthenticatedUser } from './auth-user';
import type {
  AuthUserResponseDto,
  LoginResponseDto,
} from './dto/auth-response.dto';
import { LoginDto } from './dto/login.dto';
import { NativeLoginDto, NativeRefreshDto } from './dto/native-session.dto';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @Public()
  login(@Body() dto: LoginDto): Promise<LoginResponseDto> {
    return this.authService.login(dto);
  }

  @Post('native/login')
  @Public()
  nativeLogin(@Body() dto: NativeLoginDto) {
    return this.authService.nativeLogin(dto);
  }

  @Post('native/refresh')
  @Public()
  nativeRefresh(@Body() dto: NativeRefreshDto) {
    return this.authService.refreshNativeSession(dto.refreshToken);
  }

  @Post('native/logout')
  @Public()
  nativeLogout(@Body() dto: NativeRefreshDto) {
    return this.authService.revokeNativeSession(dto.refreshToken);
  }

  @Post('native/users/:userId/revoke-sessions')
  @RequirePermissions(PERMISSIONS.users.manage)
  revokeUserNativeSessions(
    @Param('userId') userId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.authService.revokeAllNativeSessionsForUser(userId, actor.id);
  }

  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser): AuthUserResponseDto {
    return user;
  }
}
