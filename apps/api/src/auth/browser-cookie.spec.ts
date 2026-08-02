import type { Response } from 'express';
import {
  clearBrowserSessionCookies,
  setBrowserSessionCookies,
} from './browser-cookie';

describe('browser session cookies', () => {
  const policy = { secure: true };

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
      policy,
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
    clearBrowserSessionCookies(response, policy);
    expect(clearCookie).toHaveBeenCalledTimes(5);
    expect(clearCookie).toHaveBeenCalledWith(
      'bestar_auth_token',
      expect.objectContaining({ path: '/', secure: true }),
    );
  });

  it('sets and clears the same host-only cookies without Secure for approved LAN HTTP', () => {
    const response = {
      clearCookie: jest.fn(),
      cookie: jest.fn(),
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
      { secure: false },
    );
    clearBrowserSessionCookies(response, { secure: false });

    for (const call of (response.cookie as jest.Mock).mock.calls) {
      expect(call[2]).toMatchObject({ sameSite: 'lax', secure: false });
      expect(call[2]).not.toHaveProperty('domain');
    }
    for (const call of (response.clearCookie as jest.Mock).mock.calls) {
      expect(call[1]).toMatchObject({ sameSite: 'lax', secure: false });
      expect(call[1]).not.toHaveProperty('domain');
    }
  });
});
