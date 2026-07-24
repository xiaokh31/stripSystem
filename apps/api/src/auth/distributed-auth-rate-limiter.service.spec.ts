import { ConfigService } from '@nestjs/config';
import type { PublicDeploymentConfiguration } from '../config/public-deployment.config';
import { DistributedAuthRateLimiter } from './distributed-auth-rate-limiter.service';

describe('DistributedAuthRateLimiter Redis semantics', () => {
  const identity = `cross-instance-${process.pid}-${Date.now()}`;
  const configuration: PublicDeploymentConfiguration = {
    allowedOrigins: ['https://warehouse.example.com'],
    authRateLimitFailClosed: true,
    authRateLimitMax: 2,
    authRateLimitWindowSeconds: 60,
    baseUrl: 'https://warehouse.example.com',
    browserAccessExpiresInSeconds: 900,
    browserSessionAbsoluteExpiresInSeconds: 34_560_000,
    browserSessionIdleExpiresInSeconds: 34_560_000,
    cookieSecure: true,
    enabled: true,
    trustedProxyCidrs: ['172.20.0.0/16'],
    trustedProxyMode: 'cloudflare-tunnel',
  };
  const instances: DistributedAuthRateLimiter[] = [];

  it('shares limits across instances and a replacement instance', async () => {
    const first = limiter('redis://redis:6379/0');
    const second = limiter('redis://redis:6379/0');
    instances.push(first, second);

    await first.assertAllowed('browser-login', identity);
    await second.assertAllowed('browser-login', identity);

    const replacement = limiter('redis://redis:6379/0');
    instances.push(replacement);
    await expect(
      replacement.assertAllowed('browser-login', identity),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'AUTH_RATE_LIMITED' }),
      status: 429,
    });
  });

  it('fails closed in public mode when Redis is unavailable', async () => {
    const unavailable = limiter('redis://127.0.0.1:1/0');
    instances.push(unavailable);
    await expect(
      unavailable.assertAllowed('browser-refresh', `${identity}-unavailable`),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'AUTH_RATE_LIMIT_UNAVAILABLE',
      }),
      status: 503,
    });
  });

  afterEach(() => {
    instances.splice(0).forEach((item) => item.onModuleDestroy());
  });

  function limiter(redisUrl: string): DistributedAuthRateLimiter {
    return new DistributedAuthRateLimiter({
      get: (key: string) =>
        key === 'app.redisUrl'
          ? redisUrl
          : key === 'app.publicDeployment'
            ? configuration
            : undefined,
    } as ConfigService);
  }
});
