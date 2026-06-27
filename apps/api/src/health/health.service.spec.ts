import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { HealthService } from './health.service';
import { DatabaseHealth, PrismaService } from '../prisma/prisma.service';

describe('HealthService', () => {
  let prisma: jest.Mocked<Pick<PrismaService, 'checkConnection'>>;

  async function createService(
    databaseHealth: DatabaseHealth,
  ): Promise<HealthService> {
    prisma = {
      checkConnection: jest.fn().mockResolvedValue(databaseHealth),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) =>
              key === 'app.version' ? '1.2.3-test' : undefined,
            ),
          },
        },
      ],
    }).compile();

    return module.get(HealthService);
  }

  it('returns ok when the database is reachable', async () => {
    const service = await createService({ status: 'up' });

    await expect(service.check()).resolves.toMatchObject({
      status: 'ok',
      version: '1.2.3-test',
      database: { status: 'up' },
    });
    expect(prisma.checkConnection).toHaveBeenCalledTimes(1);
  });

  it('returns degraded with database details when the database is down', async () => {
    const service = await createService({
      status: 'down',
      error: {
        code: 'DATABASE_UNAVAILABLE',
        message: 'connection refused',
      },
    });

    await expect(service.check()).resolves.toMatchObject({
      status: 'degraded',
      database: {
        status: 'down',
        error: {
          code: 'DATABASE_UNAVAILABLE',
          message: 'connection refused',
        },
      },
    });
  });
});
