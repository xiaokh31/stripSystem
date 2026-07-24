import { resolve, sep } from 'node:path';
import { DEFAULT_LEGACY_ACCESS_TOKEN_EXPIRES_IN_SECONDS } from './auth-session.constants';
import {
  DEFAULT_NATIVE_ACCESS_TOKEN_EXPIRES_IN_SECONDS,
  DEFAULT_NATIVE_REFRESH_RATE_LIMIT_MAX,
  DEFAULT_NATIVE_REFRESH_RATE_LIMIT_WINDOW_SECONDS,
  DEFAULT_NATIVE_SESSION_ABSOLUTE_EXPIRES_IN_SECONDS,
  DEFAULT_NATIVE_SESSION_IDLE_EXPIRES_IN_SECONDS,
} from './native-auth.constants';
import {
  parsePublicDeploymentConfiguration,
  PublicDeploymentConfiguration,
} from './public-deployment.config';

export const DEFAULT_DATABASE_URL =
  'postgresql://bestar:bestar_dev_password@localhost:15432/bestar_unloading?schema=public';
export const DEFAULT_REDIS_URL = 'redis://localhost:16379';

export interface AppConfiguration {
  port: number;
  version: string;
  databaseUrl: string;
  storageRoot: string;
  workerPythonDir: string;
  reportTemplatePath: string;
  wageTemplatePath: string;
  redisUrl?: string;
  queueEnabled: boolean;
  queueName: string;
  queueConcurrency: number;
  jwtSecret?: string;
  jwtExpiresInSeconds: number;
  nativeAccessTokenExpiresInSeconds: number;
  nativeSessionIdleExpiresInSeconds: number;
  nativeSessionAbsoluteExpiresInSeconds: number;
  nativeRefreshRateLimitMax: number;
  nativeRefreshRateLimitWindowSeconds: number;
  publicDeployment: PublicDeploymentConfiguration;
}

export const appConfig = (): { app: AppConfiguration } => {
  const publicDeployment = parsePublicDeploymentConfiguration({
    publicDeploymentEnabled: process.env.PUBLIC_DEPLOYMENT_ENABLED,
    publicBaseUrl: process.env.PUBLIC_BASE_URL,
    corsOrigins: process.env.CORS_ORIGINS,
    browserCookieSecure: process.env.BROWSER_COOKIE_SECURE,
    trustedProxyMode: process.env.TRUSTED_PROXY_MODE,
    trustedProxyCidrs: process.env.TRUSTED_PROXY_CIDRS,
    browserAccessExpiresInSeconds:
      process.env.BROWSER_ACCESS_TOKEN_EXPIRES_IN_SECONDS,
    browserSessionIdleExpiresInSeconds:
      process.env.BROWSER_SESSION_IDLE_EXPIRES_IN_SECONDS,
    browserSessionAbsoluteExpiresInSeconds:
      process.env.BROWSER_SESSION_ABSOLUTE_EXPIRES_IN_SECONDS,
    authRateLimitMax: process.env.AUTH_RATE_LIMIT_MAX,
    authRateLimitWindowSeconds: process.env.AUTH_RATE_LIMIT_WINDOW_SECONDS,
    authRateLimitFailClosed: process.env.AUTH_RATE_LIMIT_FAIL_CLOSED,
    jwtSecret: process.env.JWT_SECRET,
    redisUrl: process.env.REDIS_URL,
  });

  return { app: {
    port: Number.parseInt(
      process.env.PORT ?? process.env.API_PORT ?? '4000',
      10,
    ),
    version: process.env.npm_package_version ?? '0.0.1',
    databaseUrl: process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL,
    storageRoot: process.env.STORAGE_ROOT ?? defaultStorageRoot(),
    workerPythonDir: process.env.WORKER_PYTHON_DIR ?? defaultWorkerPythonDir(),
    reportTemplatePath:
      process.env.REPORT_TEMPLATE_PATH ?? defaultReportTemplatePath(),
    wageTemplatePath:
      process.env.WAGE_TEMPLATE_PATH ?? defaultWageTemplatePath(),
    redisUrl: process.env.REDIS_URL ?? DEFAULT_REDIS_URL,
    queueEnabled: queueEnabled(),
    queueName: process.env.QUEUE_NAME ?? 'bestar-async-jobs',
    queueConcurrency: Number.parseInt(process.env.QUEUE_CONCURRENCY ?? '2', 10),
    jwtSecret: process.env.JWT_SECRET,
    jwtExpiresInSeconds: parsePositiveInteger(
      process.env.JWT_EXPIRES_IN_SECONDS,
      DEFAULT_LEGACY_ACCESS_TOKEN_EXPIRES_IN_SECONDS,
    ),
    nativeAccessTokenExpiresInSeconds: parsePositiveInteger(
      process.env.NATIVE_ACCESS_TOKEN_EXPIRES_IN_SECONDS,
      DEFAULT_NATIVE_ACCESS_TOKEN_EXPIRES_IN_SECONDS,
    ),
    nativeSessionIdleExpiresInSeconds: parsePositiveInteger(
      process.env.NATIVE_SESSION_IDLE_EXPIRES_IN_SECONDS,
      DEFAULT_NATIVE_SESSION_IDLE_EXPIRES_IN_SECONDS,
    ),
    nativeSessionAbsoluteExpiresInSeconds: parsePositiveInteger(
      process.env.NATIVE_SESSION_ABSOLUTE_EXPIRES_IN_SECONDS,
      DEFAULT_NATIVE_SESSION_ABSOLUTE_EXPIRES_IN_SECONDS,
    ),
    nativeRefreshRateLimitMax: parsePositiveInteger(
      process.env.NATIVE_REFRESH_RATE_LIMIT_MAX,
      DEFAULT_NATIVE_REFRESH_RATE_LIMIT_MAX,
    ),
    nativeRefreshRateLimitWindowSeconds: parsePositiveInteger(
      process.env.NATIVE_REFRESH_RATE_LIMIT_WINDOW_SECONDS,
      DEFAULT_NATIVE_REFRESH_RATE_LIMIT_WINDOW_SECONDS,
    ),
    publicDeployment,
  },
  };
};

function parsePositiveInteger(
  value: string | undefined,
  fallback: number,
): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function queueEnabled(): boolean {
  if (process.env.QUEUE_ENABLED !== undefined) {
    return !['0', 'false', 'off', 'no'].includes(
      process.env.QUEUE_ENABLED.toLowerCase(),
    );
  }

  if (process.env.JEST_WORKER_ID !== undefined) {
    return false;
  }

  return process.env.NODE_ENV !== 'test';
}

function defaultStorageRoot(): string {
  return resolve(defaultRepoRoot(), 'storage');
}

function defaultWorkerPythonDir(): string {
  return resolve(defaultRepoRoot(), 'apps', 'worker-python');
}

function defaultReportTemplatePath(): string {
  return resolve(defaultRepoRoot(), 'samples', 'templates', '卸柜报告-En.xlsx');
}

function defaultWageTemplatePath(): string {
  return resolve(
    defaultRepoRoot(),
    'samples',
    'wage',
    '20260601-0630_wageRecords.xls',
  );
}

function defaultRepoRoot(): string {
  const cwd = process.cwd();
  const apiSuffix = `${sep}apps${sep}api`;

  if (cwd.endsWith(apiSuffix)) {
    return resolve(cwd, '..', '..');
  }

  return cwd;
}
