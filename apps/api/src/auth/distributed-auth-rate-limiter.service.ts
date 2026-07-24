import {
  HttpException,
  HttpStatus,
  Injectable,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import IORedis from 'ioredis';
import { createHash } from 'node:crypto';
import type { PublicDeploymentConfiguration } from '../config/public-deployment.config';

const RATE_LIMIT_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('TTL', KEYS[1])
return {count, ttl}
`;

@Injectable()
export class DistributedAuthRateLimiter implements OnModuleDestroy {
  private redis?: IORedis;
  private readonly fallbackWindows = new Map<
    string,
    { count: number; resetAt: number }
  >();

  constructor(private readonly configService: ConfigService) {}

  async assertAllowed(
    scope: 'browser-login' | 'browser-refresh' | 'password-recovery',
    canonicalIdentity: string,
  ): Promise<void> {
    const key = `bestar:auth-rate:${scope}:${this.hash(canonicalIdentity)}`;
    try {
      const client = this.client;
      if (client.status === 'wait') await client.connect();
      const result = (await client.eval(
        RATE_LIMIT_SCRIPT,
        1,
        key,
        String(this.configuration.authRateLimitWindowSeconds),
      )) as [number, number];
      this.throwIfExceeded(Number(result[0]), Math.max(1, Number(result[1])));
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.resetRedisConnection();
      if (this.configuration.authRateLimitFailClosed) {
        throw new HttpException(
          {
            code: 'AUTH_RATE_LIMIT_UNAVAILABLE',
            message: 'Authentication request protection is unavailable.',
            details: {},
          },
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }
      this.assertFallbackAllowed(key);
    }
  }

  onModuleDestroy(): void {
    this.resetRedisConnection();
  }

  private get client(): IORedis {
    if (!this.redis) {
      const redisUrl = this.configService.get<string>('app.redisUrl')?.trim();
      if (!redisUrl) throw new Error('REDIS_URL_REQUIRED');
      this.redis = new IORedis(redisUrl, {
        enableOfflineQueue: false,
        lazyConnect: true,
        maxRetriesPerRequest: 0,
      });
      this.redis.on('error', () => undefined);
    }
    return this.redis;
  }

  private get configuration(): PublicDeploymentConfiguration {
    const value = this.configService.get<PublicDeploymentConfiguration>(
      'app.publicDeployment',
    );
    if (!value) throw new Error('TYPED_PUBLIC_CONFIG_REQUIRED');
    return value;
  }

  private assertFallbackAllowed(key: string, now = Date.now()): void {
    const existing = this.fallbackWindows.get(key);
    if (!existing || existing.resetAt <= now) {
      this.fallbackWindows.set(key, {
        count: 1,
        resetAt:
          now + this.configuration.authRateLimitWindowSeconds * 1_000,
      });
      return;
    }
    existing.count += 1;
    this.throwIfExceeded(
      existing.count,
      Math.max(1, Math.ceil((existing.resetAt - now) / 1_000)),
    );
  }

  private throwIfExceeded(count: number, retryAfterSeconds: number): void {
    if (count <= this.configuration.authRateLimitMax) return;
    throw new HttpException(
      {
        code: 'AUTH_RATE_LIMITED',
        message: 'Authentication request rate limit exceeded.',
        details: { retryAfterSeconds },
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  private hash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private resetRedisConnection(): void {
    this.redis?.disconnect(false);
    this.redis = undefined;
  }
}
