import { HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NativeRefreshRateLimiter } from './native-refresh-rate-limiter.service';

describe('NativeRefreshRateLimiter', () => {
  it('limits repeated attempts by refresh hash without retaining or exposing the token', () => {
    const limiter = new NativeRefreshRateLimiter({
      get: (key: string) => (key === 'app.nativeRefreshRateLimitMax' ? 2 : 60),
    } as ConfigService);

    limiter.assertAllowed('sha256-hash', 1_000);
    limiter.assertAllowed('sha256-hash', 1_001);
    expect(() => limiter.assertAllowed('sha256-hash', 1_002)).toThrow(
      HttpException,
    );

    try {
      limiter.assertAllowed('sha256-hash', 1_003);
    } catch (error) {
      expect(error).toMatchObject({
        response: expect.objectContaining({
          code: 'AUTH_REFRESH_RATE_LIMITED',
        }),
        status: 429,
      });
      expect(JSON.stringify(error)).not.toContain('refresh-token-secret');
    }
  });
});
