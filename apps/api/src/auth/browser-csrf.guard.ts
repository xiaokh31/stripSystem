import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { AuthenticatedRequest } from './auth-user';
import { readCookie } from './browser-cookie';
import {
  BROWSER_CSRF_COOKIE,
  BROWSER_CSRF_HEADER,
} from './browser-session.constants';
import { BrowserSessionService } from './browser-session.service';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

@Injectable()
export class BrowserCsrfGuard implements CanActivate {
  constructor(private readonly browserSessions: BrowserSessionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (
      SAFE_METHODS.has(request.method.toUpperCase()) ||
      request.authDelivery !== 'browser'
    ) {
      return true;
    }

    this.browserSessions.assertAllowedOrigin(request);
    const cookie = readCookie(request.headers.cookie, BROWSER_CSRF_COOKIE);
    const header = request.get(BROWSER_CSRF_HEADER);
    const valid = Boolean(
      cookie &&
        header &&
        cookie === header &&
        request.authSessionId &&
        (await this.browserSessions.validateCsrf(
          request.authSessionId,
          header,
        )),
    );
    if (!valid) {
      await this.browserSessions.recordCsrfRejection(
        request.authSessionId ?? '',
        request,
      );
      throw new ForbiddenException({
        code: 'CSRF_REJECTED',
        message: 'Request rejected.',
        details: {},
      });
    }
    return true;
  }
}
