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
  const allowedOrigins = parseList(input.corsOrigins);
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
  input: Pick<PublicDeploymentInput, 'jwtSecret' | 'redisUrl'>,
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
    configuration.allowedOrigins.some(
      (origin) => origin === '*' || safeUrl(origin)?.protocol !== 'https:',
    )
  ) {
    errors.push('PUBLIC_CORS_HTTPS_ORIGINS_REQUIRED');
  }
  if (
    publicUrl &&
    !configuration.allowedOrigins.includes(publicUrl.origin)
  ) {
    errors.push('PUBLIC_CORS_MUST_INCLUDE_BASE_ORIGIN');
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
