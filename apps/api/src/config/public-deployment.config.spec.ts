import {
  MAX_BROWSER_SESSION_SECONDS,
  parsePublicDeploymentConfiguration,
} from './public-deployment.config';

describe('public deployment configuration', () => {
  const safePublicInput = {
    publicDeploymentEnabled: 'true',
    publicBaseUrl: 'https://warehouse.example.com',
    corsOrigins: 'https://warehouse.example.com',
    browserCookieSecure: 'true',
    trustedProxyMode: 'cloudflare-tunnel',
    trustedProxyCidrs: '172.20.0.0/16,::1/128',
    jwtSecret: 'a-unique-production-secret-that-is-long-enough',
    redisUrl: 'redis://redis:6379',
    authRateLimitFailClosed: 'true',
  };

  it('keeps local mode compatible without public credentials', () => {
    expect(parsePublicDeploymentConfiguration({})).toMatchObject({
      enabled: false,
      cookieSecure: false,
      trustedProxyMode: 'none',
    });
  });

  it('accepts an explicit HTTPS public contract with a 400-day ceiling', () => {
    expect(parsePublicDeploymentConfiguration(safePublicInput)).toMatchObject({
      enabled: true,
      baseUrl: 'https://warehouse.example.com',
      browserSessionAbsoluteExpiresInSeconds: MAX_BROWSER_SESSION_SECONDS,
      cookieSecure: true,
    });
  });

  it('accepts an explicit private HTTP LAN browser origin without weakening the public origin', () => {
    const configuration = parsePublicDeploymentConfiguration({
      ...safePublicInput,
      lanBrowserEnabled: 'true',
      lanBrowserOrigins: 'http://192.168.20.15,http://warehouse-lan:8080',
    });

    expect(configuration).toMatchObject({
      baseUrl: 'https://warehouse.example.com',
      cookieSecure: true,
      lanBrowserEnabled: true,
      lanBrowserOrigins: [
        'http://192.168.20.15',
        'http://warehouse-lan:8080',
      ],
    });
    expect(configuration.allowedOrigins).toEqual([
      'https://warehouse.example.com',
      'http://192.168.20.15',
      'http://warehouse-lan:8080',
    ]);
  });

  it('accepts the IPv6 loopback as an explicitly configured LAN origin', () => {
    expect(
      parsePublicDeploymentConfiguration({
        ...safePublicInput,
        lanBrowserEnabled: 'true',
        lanBrowserOrigins: 'http://[::1]:8080',
      }).lanBrowserOrigins,
    ).toEqual(['http://[::1]:8080']);
  });

  it.each([
    [{ publicBaseUrl: 'http://warehouse.example.com' }, 'PUBLIC_BASE_URL_HTTPS_REQUIRED'],
    [{ jwtSecret: 'replace-with-long-random-secret' }, 'PUBLIC_JWT_SECRET_UNSAFE'],
    [{ corsOrigins: '*' }, 'PUBLIC_CORS_HTTPS_ORIGINS_REQUIRED'],
    [{ trustedProxyMode: 'none' }, 'PUBLIC_TRUSTED_PROXY_REQUIRED'],
    [{ trustedProxyCidrs: '' }, 'PUBLIC_TRUSTED_PROXY_CIDRS_REQUIRED'],
    [{ browserCookieSecure: 'false' }, 'PUBLIC_SECURE_COOKIE_REQUIRED'],
    [
      { browserSessionAbsoluteExpiresInSeconds: String(MAX_BROWSER_SESSION_SECONDS + 1) },
      'PUBLIC_BROWSER_SESSION_MAX_400_DAYS',
    ],
    [{ authRateLimitFailClosed: 'false' }, 'PUBLIC_AUTH_RATE_LIMIT_FAIL_CLOSED_REQUIRED'],
    [{ lanBrowserEnabled: 'true', lanBrowserOrigins: '' }, 'LAN_BROWSER_ORIGINS_REQUIRED'],
    [{ lanBrowserOrigins: 'http://192.168.20.15' }, 'LAN_BROWSER_ORIGINS_REQUIRE_ENABLE'],
    [{ lanBrowserEnabled: 'true', lanBrowserOrigins: 'https://192.168.20.15' }, 'LAN_BROWSER_ORIGIN_HTTP_REQUIRED'],
    [{ lanBrowserEnabled: 'true', lanBrowserOrigins: 'http://203.0.113.20' }, 'LAN_BROWSER_ORIGIN_PRIVATE_REQUIRED'],
    [{ lanBrowserEnabled: 'true', lanBrowserOrigins: '*' }, 'LAN_BROWSER_ORIGIN_HTTP_REQUIRED'],
    [{ lanBrowserEnabled: 'true', lanBrowserOrigins: 'http://192.168.20.15,http://192.168.20.15' }, 'LAN_BROWSER_ORIGIN_DUPLICATE'],
    [{ corsOrigins: 'https://warehouse.example.com,https://warehouse.example.com' }, 'PUBLIC_CORS_ORIGIN_DUPLICATE'],
    [{ corsOrigins: 'https://warehouse.example.com,https://other.example.com' }, 'PUBLIC_CORS_ORIGIN_NOT_APPROVED'],
  ])('rejects dangerous public input %j', (override, code) => {
    expect(() =>
      parsePublicDeploymentConfiguration({ ...safePublicInput, ...override }),
    ).toThrow(code);
  });
});
