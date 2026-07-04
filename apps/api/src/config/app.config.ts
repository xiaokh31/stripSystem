import { resolve, sep } from 'node:path';

export const DEFAULT_DATABASE_URL =
  'postgresql://bestar:bestar_dev_password@localhost:15432/bestar_unloading?schema=public';

export interface AppConfiguration {
  port: number;
  version: string;
  databaseUrl: string;
  storageRoot: string;
  workerPythonDir: string;
  reportTemplatePath: string;
  wageTemplatePath: string;
  jwtSecret?: string;
  jwtExpiresInSeconds: number;
}

export const appConfig = (): { app: AppConfiguration } => ({
  app: {
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
    jwtSecret: process.env.JWT_SECRET,
    jwtExpiresInSeconds: Number.parseInt(
      process.env.JWT_EXPIRES_IN_SECONDS ?? '28800',
      10,
    ),
  },
});

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
