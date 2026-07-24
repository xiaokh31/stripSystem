import type { Response } from 'express';
import type { PublicDeploymentConfiguration } from '../config/public-deployment.config';
import {
  clearBrowserSessionCookies,
  setBrowserSessionCookies,
} from './browser-cookie';

describe('browser session cookies', () => {
  const configuration = {
    cookieSecure: true,
  } as PublicDeploymentConfiguration;

  it('sets short access and narrow opaque refresh cookies securely', () => {
    const calls: Array<{ name: string; options: Record<string, unknown> }> = [];
    const response = {
      clearCookie: jest.fn(),
      cookie: jest.fn((name, _value, options) => {
        calls.push({ name, options });
      }),
    } as unknown as Response;
    const refreshExpiresAt = new Date(Date.now() + 34_560_000_000);

    setBrowserSessionCookies(
      response,
      {
        accessExpiresInSeconds: 900,
        accessToken: 'access-secret',
        csrfToken: 'csrf-secret',
        refreshExpiresAt,
        refreshToken: 'refresh-secret',
      },
      configuration,
    );

    expect(calls).toEqual(
      expect.arrayContaining([
        {
          name: 'bestar_access',
          options: expect.objectContaining({
            httpOnly: true,
            maxAge: 900_000,
            path: '/',
            sameSite: 'lax',
            secure: true,
          }),
        },
        {
          name: 'bestar_refresh',
          options: expect.objectContaining({
            httpOnly: true,
            path: '/api/auth/browser',
            secure: true,
          }),
        },
        {
          name: 'bestar_csrf',
          options: expect.objectContaining({
            httpOnly: false,
            path: '/',
            secure: true,
          }),
        },
        {
          name: 'bestar_session',
          options: expect.objectContaining({
            httpOnly: true,
            path: '/',
            secure: true,
          }),
        },
      ]),
    );
  });

  it('clears current and legacy browser cookies on logout/migration', () => {
    const clearCookie = jest.fn();
    const response = {
      clearCookie,
    } as unknown as Response;
    clearBrowserSessionCookies(response, configuration);
    expect(clearCookie).toHaveBeenCalledTimes(5);
    expect(clearCookie).toHaveBeenCalledWith(
      'bestar_auth_token',
      expect.objectContaining({ path: '/', secure: true }),
    );
  });
});
