import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DEFAULT_NATIVE_REFRESH_RATE_LIMIT_MAX,
  DEFAULT_NATIVE_REFRESH_RATE_LIMIT_WINDOW_SECONDS,
} from '../config/native-auth.constants';

interface RefreshRateWindow {
  count: number;
  resetAt: number;
}

@Injectable()
export class NativeRefreshRateLimiter {
  private readonly windows = new Map<string, RefreshRateWindow>();

  constructor(private readonly configService: ConfigService) {}

  assertAllowed(refreshTokenHash: string, now = Date.now()): void {
    const existing = this.windows.get(refreshTokenHash);
    if (!existing || existing.resetAt <= now) {
      this.windows.set(refreshTokenHash, {
        count: 1,
        resetAt: now + this.windowSeconds * 1000,
      });
      this.prune(now);
      return;
    }

    existing.count += 1;
    if (existing.count > this.maxAttempts) {
      throw new HttpException(
        {
          code: 'AUTH_REFRESH_RATE_LIMITED',
          message: 'Native session refresh rate limit exceeded.',
          details: {
            retryAfterSeconds: Math.ceil((existing.resetAt - now) / 1000),
          },
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private get maxAttempts(): number {
    return this.positiveConfig(
      'app.nativeRefreshRateLimitMax',
      DEFAULT_NATIVE_REFRESH_RATE_LIMIT_MAX,
    );
  }

  private get windowSeconds(): number {
    return this.positiveConfig(
      'app.nativeRefreshRateLimitWindowSeconds',
      DEFAULT_NATIVE_REFRESH_RATE_LIMIT_WINDOW_SECONDS,
    );
  }

  private positiveConfig(key: string, fallback: number): number {
    const value = this.configService.get<number>(key);
    return typeof value === 'number' && Number.isFinite(value) && value > 0
      ? value
      : fallback;
  }

  private prune(now: number): void {
    if (this.windows.size < 1_000) {
      return;
    }
    for (const [key, value] of this.windows) {
      if (value.resetAt <= now) {
        this.windows.delete(key);
      }
    }
  }
}
