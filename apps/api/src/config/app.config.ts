import { resolve, sep } from 'node:path';

export const DEFAULT_DATABASE_URL =
  'postgresql://bestar:bestar_dev_password@localhost:5432/bestar_unloading?schema=public';

export interface AppConfiguration {
  port: number;
  version: string;
  databaseUrl: string;
  storageRoot: string;
}

export const appConfig = (): { app: AppConfiguration } => ({
  app: {
    port: Number.parseInt(process.env.PORT ?? '3000', 10),
    version: process.env.npm_package_version ?? '0.0.1',
    databaseUrl: process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL,
    storageRoot: process.env.STORAGE_ROOT ?? defaultStorageRoot(),
  },
});

function defaultStorageRoot(): string {
  const cwd = process.cwd();
  const apiSuffix = `${sep}apps${sep}api`;

  if (cwd.endsWith(apiSuffix)) {
    return resolve(cwd, '..', '..', 'storage');
  }

  return resolve(cwd, 'storage');
}
