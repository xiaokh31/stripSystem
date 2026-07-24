import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthTokenService } from './auth-token.service';
import { DEFAULT_LEGACY_ACCESS_TOKEN_EXPIRES_IN_SECONDS } from '../config/auth-session.constants';

describe('AuthTokenService', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('uses the short legacy access default when config has no override', () => {
    const service = new AuthTokenService(configService());

    const token = service.sign({
      sub: 'user-1',
      email: 'office@example.com',
      roles: ['OFFICE'],
    });

    expect(token.expiresIn).toBe(
      DEFAULT_LEGACY_ACCESS_TOKEN_EXPIRES_IN_SECONDS,
    );
  });

  it('rejects expired tokens with explicit AUTH_TOKEN_EXPIRED', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-11T00:00:00.000Z'));
    const service = new AuthTokenService(configService(1));
    const token = service.sign({
      sub: 'user-1',
      email: 'office@example.com',
      roles: ['OFFICE'],
    });

    jest.setSystemTime(new Date('2026-07-11T00:00:02.000Z'));

    expect(() => service.verify(token.accessToken)).toThrow(
      UnauthorizedException,
    );
    expect(() => service.verify(token.accessToken)).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({ code: 'AUTH_TOKEN_EXPIRED' }),
      }),
    );
  });
});

function configService(expiresInSeconds?: number): ConfigService {
  return {
    get: jest.fn((key: string) => {
      if (key === 'app.jwtSecret') {
        return 'unit-test-secret';
      }
      if (key === 'app.jwtExpiresInSeconds') {
        return expiresInSeconds;
      }
      return undefined;
    }),
  } as unknown as ConfigService;
}
