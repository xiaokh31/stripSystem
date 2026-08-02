import { isIP } from 'node:net';

export const MAX_BROWSER_SESSION_SECONDS = 400 * 24 * 60 * 60;
export const DEFAULT_BROWSER_ACCESS_SECONDS = 15 * 60;
export const DEFAULT_AUTH_RATE_LIMIT_MAX = 10;
export const DEFAULT_AUTH_RATE_LIMIT_WINDOW_SECONDS = 60;

export type TrustedProxyMode = 'none' | 'cloudflare-tunnel' | 'private-cidrs';

export interface PublicDeploymentConfiguration {
  enabled: boolean;
  baseUrl?: string;
  allowedOrigins: string[];
  cookieSecure: boolean;
  lanBrowserEnabled: boolean;
  lanBrowserOrigins: string[];
  trustedProxyMode: TrustedProxyMode;
  trustedProxyCidrs: string[];
  browserAccessExpiresInSeconds: number;
  browserSessionIdleExpiresInSeconds: number;
  browserSessionAbsoluteExpiresInSeconds: number;
  authRateLimitMax: number;
  authRateLimitWindowSeconds: number;
  authRateLimitFailClosed: boolean;
}

export interface PublicDeploymentInput {
  publicDeploymentEnabled?: string;
  publicBaseUrl?: string;
  corsOrigins?: string;
  browserCookieSecure?: string;
  lanBrowserEnabled?: string;
  lanBrowserOrigins?: string;
  trustedProxyMode?: string;
  trustedProxyCidrs?: string;
  browserAccessExpiresInSeconds?: string;
  browserSessionIdleExpiresInSeconds?: string;
  browserSessionAbsoluteExpiresInSeconds?: string;
  authRateLimitMax?: string;
  authRateLimitWindowSeconds?: string;
  authRateLimitFailClosed?: string;
  jwtSecret?: string;
  redisUrl?: string;
}

const PLACEHOLDER_SECRET_PATTERN =
  /(replace|placeholder|change[-_ ]?me|example|default|dev[-_ ]?secret)/i;

export function parsePublicDeploymentConfiguration(
  input: PublicDeploymentInput,
): PublicDeploymentConfiguration {
  const enabled = parseBoolean(input.publicDeploymentEnabled, false);
  const baseUrl = optionalTrim(input.publicBaseUrl);
  const configuredOrigins = parseList(input.corsOrigins);
  const lanBrowserEnabled = parseBoolean(input.lanBrowserEnabled, false);
  const lanBrowserOrigins = parseList(input.lanBrowserOrigins);
  const allowedOrigins = [...new Set([...configuredOrigins, ...lanBrowserOrigins])];
  const cookieSecure = parseBoolean(input.browserCookieSecure, enabled);
  const trustedProxyMode = parseTrustedProxyMode(input.trustedProxyMode);
  const trustedProxyCidrs = parseList(input.trustedProxyCidrs);
  const configuration: PublicDeploymentConfiguration = {
    enabled,
    baseUrl,
    allowedOrigins:
      allowedOrigins.length > 0
        ? allowedOrigins
        : ['http://localhost:3000', 'http://127.0.0.1:3000'],
    cookieSecure,
    lanBrowserEnabled,
    lanBrowserOrigins,
    trustedProxyMode,
    trustedProxyCidrs,
    browserAccessExpiresInSeconds: parsePositiveInteger(
      input.browserAccessExpiresInSeconds,
      DEFAULT_BROWSER_ACCESS_SECONDS,
    ),
    browserSessionIdleExpiresInSeconds: parsePositiveInteger(
      input.browserSessionIdleExpiresInSeconds,
      MAX_BROWSER_SESSION_SECONDS,
    ),
    browserSessionAbsoluteExpiresInSeconds: parsePositiveInteger(
      input.browserSessionAbsoluteExpiresInSeconds,
      MAX_BROWSER_SESSION_SECONDS,
    ),
    authRateLimitMax: parsePositiveInteger(
      input.authRateLimitMax,
      DEFAULT_AUTH_RATE_LIMIT_MAX,
    ),
    authRateLimitWindowSeconds: parsePositiveInteger(
      input.authRateLimitWindowSeconds,
      DEFAULT_AUTH_RATE_LIMIT_WINDOW_SECONDS,
    ),
    authRateLimitFailClosed: parseBoolean(
      input.authRateLimitFailClosed,
      enabled,
    ),
  };

  validatePublicDeploymentConfiguration(configuration, input);
  return configuration;
}

export function validatePublicDeploymentConfiguration(
  configuration: PublicDeploymentConfiguration,
  input: Pick<
    PublicDeploymentInput,
    'jwtSecret' | 'redisUrl' | 'corsOrigins' | 'lanBrowserOrigins'
  >,
): void {
  if (!configuration.enabled) {
    return;
  }

  const errors: string[] = [];
  const publicUrl = safeUrl(configuration.baseUrl);
  if (!publicUrl || publicUrl.protocol !== 'https:') {
    errors.push('PUBLIC_BASE_URL_HTTPS_REQUIRED');
  } else if (
    publicUrl.username ||
    publicUrl.password ||
    publicUrl.search ||
    publicUrl.hash ||
    (publicUrl.pathname !== '' && publicUrl.pathname !== '/')
  ) {
    errors.push('PUBLIC_BASE_URL_ORIGIN_REQUIRED');
  }

  const secret = optionalTrim(input.jwtSecret);
  if (
    !secret ||
    secret.length < 32 ||
    PLACEHOLDER_SECRET_PATTERN.test(secret)
  ) {
    errors.push('PUBLIC_JWT_SECRET_UNSAFE');
  }

  if (!optionalTrim(input.redisUrl)) {
    errors.push('PUBLIC_REDIS_REQUIRED');
  }
  if (!configuration.cookieSecure) {
    errors.push('PUBLIC_SECURE_COOKIE_REQUIRED');
  }
  if (configuration.trustedProxyMode === 'none') {
    errors.push('PUBLIC_TRUSTED_PROXY_REQUIRED');
  }
  if (configuration.trustedProxyCidrs.length === 0) {
    errors.push('PUBLIC_TRUSTED_PROXY_CIDRS_REQUIRED');
  } else if (
    configuration.trustedProxyCidrs.some((value) => !isValidCidr(value))
  ) {
    errors.push('PUBLIC_TRUSTED_PROXY_CIDR_INVALID');
  }
  if (
    configuration.allowedOrigins.length === 0 ||
    configuration.allowedOrigins.some((origin) =>
      origin === '*' ||
      (!configuration.lanBrowserOrigins.includes(origin) &&
        safeUrl(origin)?.protocol !== 'https:'),
    )
  ) {
    errors.push('PUBLIC_CORS_HTTPS_ORIGINS_REQUIRED');
  }
  if (hasDuplicateListValue(input.lanBrowserOrigins)) {
    errors.push('LAN_BROWSER_ORIGIN_DUPLICATE');
  }
  if (hasDuplicateListValue(input.corsOrigins)) {
    errors.push('PUBLIC_CORS_ORIGIN_DUPLICATE');
  }
  if (
    configuration.lanBrowserEnabled &&
    configuration.lanBrowserOrigins.length === 0
  ) {
    errors.push('LAN_BROWSER_ORIGINS_REQUIRED');
  }
  if (
    !configuration.lanBrowserEnabled &&
    configuration.lanBrowserOrigins.length > 0
  ) {
    errors.push('LAN_BROWSER_ORIGINS_REQUIRE_ENABLE');
  }
  for (const origin of configuration.lanBrowserOrigins) {
    const lanUrl = safeUrl(origin);
    if (!lanUrl || lanUrl.origin !== origin || lanUrl.protocol !== 'http:') {
      errors.push('LAN_BROWSER_ORIGIN_HTTP_REQUIRED');
      continue;
    }
    if (!isApprovedLanHostname(lanUrl.hostname)) {
      errors.push('LAN_BROWSER_ORIGIN_PRIVATE_REQUIRED');
    }
    if (publicUrl?.hostname.toLowerCase() === lanUrl.hostname.toLowerCase()) {
      errors.push('LAN_PUBLIC_HOST_CONFLICT');
    }
  }
  if (
    publicUrl &&
    !configuration.allowedOrigins.includes(publicUrl.origin)
  ) {
    errors.push('PUBLIC_CORS_MUST_INCLUDE_BASE_ORIGIN');
  }
  if (
    publicUrl &&
    configuration.allowedOrigins.some(
      (origin) =>
        origin !== publicUrl.origin &&
        !configuration.lanBrowserOrigins.includes(origin),
    )
  ) {
    errors.push('PUBLIC_CORS_ORIGIN_NOT_APPROVED');
  }
  if (
    configuration.browserSessionIdleExpiresInSeconds >
      MAX_BROWSER_SESSION_SECONDS ||
    configuration.browserSessionAbsoluteExpiresInSeconds >
      MAX_BROWSER_SESSION_SECONDS
  ) {
    errors.push('PUBLIC_BROWSER_SESSION_MAX_400_DAYS');
  }
  if (
    configuration.browserAccessExpiresInSeconds >=
    configuration.browserSessionAbsoluteExpiresInSeconds
  ) {
    errors.push('PUBLIC_ACCESS_TOKEN_MUST_BE_SHORTER_THAN_SESSION');
  }
  if (!configuration.authRateLimitFailClosed) {
    errors.push('PUBLIC_AUTH_RATE_LIMIT_FAIL_CLOSED_REQUIRED');
  }

  if (errors.length > 0) {
    throw new Error(`PUBLIC_CONFIG_INVALID:${errors.sort().join(',')}`);
  }
}

function parseTrustedProxyMode(value: string | undefined): TrustedProxyMode {
  const normalized = optionalTrim(value)?.toLowerCase() ?? 'none';
  if (
    normalized === 'none' ||
    normalized === 'cloudflare-tunnel' ||
    normalized === 'private-cidrs'
  ) {
    return normalized;
  }
  throw new Error('PUBLIC_CONFIG_INVALID:TRUSTED_PROXY_MODE_INVALID');
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  const normalized = optionalTrim(value)?.toLowerCase();
  if (!normalized) return fallback;
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  throw new Error('PUBLIC_CONFIG_INVALID:BOOLEAN_VALUE_INVALID');
}

function parsePositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function parseList(value: string | undefined): string[] {
  return [
    ...new Set(
      (value ?? '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
}

function hasDuplicateListValue(value: string | undefined): boolean {
  const items = (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  return new Set(items).size !== items.length;
}

function optionalTrim(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function safeUrl(value: string | undefined): URL | null {
  if (!value) return null;
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function isValidCidr(value: string): boolean {
  const [address, prefixText, extra] = value.split('/');
  if (extra !== undefined || !address || prefixText === undefined) return false;
  const family = isIP(address);
  const prefix = Number(prefixText);
  return (
    Number.isInteger(prefix) &&
    ((family === 4 && prefix >= 0 && prefix <= 32) ||
      (family === 6 && prefix >= 0 && prefix <= 128))
  );
}

function isApprovedLanHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  const normalized =
    lower.startsWith('[') && lower.endsWith(']') ? lower.slice(1, -1) : lower;
  if (normalized === 'localhost') return true;
  const family = isIP(normalized);
  if (family === 4) {
    const [first, second] = normalized.split('.').map(Number);
    return (
      first === 127 ||
      first === 10 ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168)
    );
  }
  if (family === 6) {
    return (
      normalized === '::1' ||
      normalized.startsWith('fc') ||
      normalized.startsWith('fd')
    );
  }
  return (
    !normalized.includes('.') ||
    normalized.endsWith('.local') ||
    normalized.endsWith('.lan') ||
    normalized.endsWith('.internal') ||
    normalized.endsWith('.home.arpa')
  );
}
