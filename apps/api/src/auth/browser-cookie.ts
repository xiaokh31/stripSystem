import type { Response } from 'express';
import type { PublicDeploymentConfiguration } from '../config/public-deployment.config';
import {
  BROWSER_ACCESS_COOKIE,
  BROWSER_CSRF_COOKIE,
  BROWSER_REFRESH_COOKIE,
  BROWSER_SESSION_HINT_COOKIE,
  BROWSER_SESSION_PATH,
  LEGACY_BROWSER_BEARER_COOKIE,
} from './browser-session.constants';

export interface BrowserCookieValues {
  accessToken: string;
  accessExpiresInSeconds: number;
  csrfToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
}

export function setBrowserSessionCookies(
  response: Response,
  values: BrowserCookieValues,
  configuration: PublicDeploymentConfiguration,
): void {
  const base = {
    sameSite: 'lax' as const,
    secure: configuration.cookieSecure,
  };
  response.cookie(BROWSER_ACCESS_COOKIE, values.accessToken, {
    ...base,
    httpOnly: true,
    maxAge: values.accessExpiresInSeconds * 1_000,
    path: '/',
  });
  response.cookie(BROWSER_REFRESH_COOKIE, values.refreshToken, {
    ...base,
    expires: values.refreshExpiresAt,
    httpOnly: true,
    path: BROWSER_SESSION_PATH,
  });
  response.cookie(BROWSER_CSRF_COOKIE, values.csrfToken, {
    ...base,
    expires: values.refreshExpiresAt,
    httpOnly: false,
    path: '/',
  });
  response.cookie(BROWSER_SESSION_HINT_COOKIE, 'active', {
    ...base,
    expires: values.refreshExpiresAt,
    httpOnly: true,
    path: '/',
  });
  clearLegacyBrowserBearerCookie(response, configuration);
}

export function clearBrowserSessionCookies(
  response: Response,
  configuration: PublicDeploymentConfiguration,
): void {
  const base = {
    sameSite: 'lax' as const,
    secure: configuration.cookieSecure,
  };
  response.clearCookie(BROWSER_ACCESS_COOKIE, { ...base, path: '/' });
  response.clearCookie(BROWSER_REFRESH_COOKIE, {
    ...base,
    path: BROWSER_SESSION_PATH,
  });
  response.clearCookie(BROWSER_CSRF_COOKIE, { ...base, path: '/' });
  response.clearCookie(BROWSER_SESSION_HINT_COOKIE, { ...base, path: '/' });
  clearLegacyBrowserBearerCookie(response, configuration);
}

export function clearLegacyBrowserBearerCookie(
  response: Response,
  configuration: PublicDeploymentConfiguration,
): void {
  response.clearCookie(LEGACY_BROWSER_BEARER_COOKIE, {
    path: '/',
    sameSite: 'lax',
    secure: configuration.cookieSecure,
  });
}

export function readCookie(cookieHeader: string | undefined, name: string) {
  const encodedPrefix = `${name}=`;
  for (const item of (cookieHeader ?? '').split(';')) {
    const trimmed = item.trim();
    if (trimmed.startsWith(encodedPrefix)) {
      try {
        return decodeURIComponent(trimmed.slice(encodedPrefix.length));
      } catch {
        return null;
      }
    }
  }
  return null;
}
