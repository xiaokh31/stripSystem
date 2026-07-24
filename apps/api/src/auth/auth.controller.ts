import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { CurrentUser, Public, RequirePermissions } from './auth.decorators';
import { PERMISSIONS } from './permissions';
import type { AuthenticatedUser } from './auth-user';
import type { AuthUserResponseDto } from './dto/auth-response.dto';
import { LoginDto } from './dto/login.dto';
import { NativeLoginDto, NativeRefreshDto } from './dto/native-session.dto';
import { AuthService } from './auth.service';
import { BrowserSessionService } from './browser-session.service';
import {
  clearBrowserSessionCookies,
  readCookie,
  setBrowserSessionCookies,
} from './browser-cookie';
import {
  BROWSER_CSRF_COOKIE,
  BROWSER_CSRF_HEADER,
  BROWSER_REFRESH_COOKIE,
} from './browser-session.constants';
import type { PublicDeploymentConfiguration } from '../config/public-deployment.config';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly browserSessionService: BrowserSessionService,
    private readonly configService: ConfigService,
  ) {}

  @Post('login')
  @Public()
  async login(
    @Body() dto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.browserSessionService.login(dto, request);
    setBrowserSessionCookies(response, result.cookieValues, this.configuration);
    return this.publicBrowserResponse(result);
  }

  @Post('browser/refresh')
  @Public()
  async browserRefresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const refreshToken = readCookie(
      request.headers.cookie,
      BROWSER_REFRESH_COOKIE,
    );
    const csrfCookie = readCookie(request.headers.cookie, BROWSER_CSRF_COOKIE);
    const csrfHeader = request.get(BROWSER_CSRF_HEADER);
    if (!refreshToken || !csrfCookie || csrfHeader !== csrfCookie) {
      clearBrowserSessionCookies(response, this.configuration);
      throw new UnauthorizedException({
        code: 'AUTH_REFRESH_EXPIRED',
        message: 'Browser session refresh was rejected.',
        details: {},
      });
    }
    const result = await this.browserSessionService.refresh(
      refreshToken,
      csrfHeader,
      request,
    );
    setBrowserSessionCookies(response, result.cookieValues, this.configuration);
    return this.publicBrowserResponse(result);
  }

  @Post('browser/logout')
  @Public()
  async browserLogout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const refreshToken = readCookie(
      request.headers.cookie,
      BROWSER_REFRESH_COOKIE,
    );
    const csrfCookie = readCookie(request.headers.cookie, BROWSER_CSRF_COOKIE);
    const csrfHeader = request.get(BROWSER_CSRF_HEADER);
    await this.browserSessionService.logout(
      refreshToken,
      csrfCookie && csrfHeader === csrfCookie ? csrfHeader : null,
      request,
    );
    clearBrowserSessionCookies(response, this.configuration);
    return { revoked: true };
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

  @Post('browser/users/:userId/revoke-sessions')
  @RequirePermissions(PERMISSIONS.users.manage)
  revokeUserBrowserSessions(
    @Param('userId') userId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.browserSessionService.revokeAllForUser(userId, actor.id);
  }

  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser): AuthUserResponseDto {
    return user;
  }

  private get configuration(): PublicDeploymentConfiguration {
    const value = this.configService.get<PublicDeploymentConfiguration>(
      'app.publicDeployment',
    );
    if (!value) throw new Error('TYPED_PUBLIC_CONFIG_REQUIRED');
    return value;
  }

  private publicBrowserResponse(result: {
    accessExpiresAt: string;
    expiresIn: number;
    sessionExpiresAt: string;
    user: AuthUserResponseDto;
  }) {
    return {
      accessExpiresAt: result.accessExpiresAt,
      expiresIn: result.expiresIn,
      sessionExpiresAt: result.sessionExpiresAt,
      user: result.user,
    };
  }
}
