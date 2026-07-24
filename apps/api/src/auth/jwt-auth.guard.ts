import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { AuthService } from './auth.service';
import { AuthenticatedRequest } from './auth-user';
import { IS_PUBLIC_KEY } from './auth.decorators';
import { readCookie } from './browser-cookie';
import {
  BROWSER_ACCESS_COOKIE,
  LEGACY_BROWSER_BEARER_COOKIE,
} from './browser-session.constants';
import type { PublicDeploymentConfiguration } from '../config/public-deployment.config';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.isPublic(context)) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (request.headers.authorization) {
      request.user = await this.authService.authenticateBearer(
        request.headers.authorization,
      );
      request.authDelivery = 'bearer';
      return true;
    }

    const browserAccess = readCookie(
      request.headers.cookie,
      BROWSER_ACCESS_COOKIE,
    );
    if (browserAccess) {
      request.user = await this.authService.authenticateBrowserAccess(
        browserAccess,
      );
      request.authDelivery = 'browser';
      request.authSessionId = this.browserSessionId(browserAccess);
      return true;
    }

    const legacyBearer = readCookie(
      request.headers.cookie,
      LEGACY_BROWSER_BEARER_COOKIE,
    );
    if (legacyBearer && !this.publicDeployment.enabled) {
      request.user = await this.authService.authenticateBrowserAccessLegacy(
        legacyBearer,
      );
      request.authDelivery = 'legacy-browser';
      return true;
    }

    request.user = await this.authService.authenticateBearer(undefined);
    return true;
  }

  private browserSessionId(token: string): string {
    const payload = token.split('.')[1];
    if (!payload) return '';
    try {
      const parsed = JSON.parse(
        Buffer.from(payload, 'base64url').toString('utf8'),
      ) as { browserSessionId?: unknown };
      return typeof parsed.browserSessionId === 'string'
        ? parsed.browserSessionId
        : '';
    } catch {
      return '';
    }
  }

  private get publicDeployment(): PublicDeploymentConfiguration {
    const value = this.configService.get<PublicDeploymentConfiguration>(
      'app.publicDeployment',
    );
    if (!value) throw new Error('TYPED_PUBLIC_CONFIG_REQUIRED');
    return value;
  }

  private isPublic(context: ExecutionContext): boolean {
    return (
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? false
    );
  }
}
