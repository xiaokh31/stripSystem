import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/app.setup';
import { PrismaService } from './../src/prisma/prisma.service';
import {
  adminAuthHeader,
  configureAuthTestEnv,
  installAuthMock,
  officeAuthHeader,
} from './auth-test-helpers';

interface ErrorBody {
  code: string;
}

interface OperationalSettingsBody {
  fields: Array<{ key: string; value: string }>;
}

interface OperationalSettingsMutationBody {
  audit: {
    actorUserId: string;
    action: string;
    changedKeys: string[];
  };
  settings: OperationalSettingsBody;
}

describe('Settings API (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: ReturnType<typeof createSettingsPrismaMock>;

  beforeEach(async () => {
    configureAuthTestEnv();
    prisma = createSettingsPrismaMock();
    installAuthMock(prisma);

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('allows signed-in users to read operational settings', async () => {
    await request(app.getHttpServer())
      .get('/api/settings/operational')
      .set('Authorization', officeAuthHeader())
      .expect(200)
      .expect((response) => {
        const body = response.body as OperationalSettingsBody;
        expect(body.fields).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              key: 'deliveryPhase',
              value: 'P5 Pilot Ready',
            }),
          ]),
        );
      });
  });

  it('allows ADMIN to update operational settings', async () => {
    await request(app.getHttpServer())
      .patch('/api/settings/operational')
      .set('Authorization', adminAuthHeader())
      .send({ values: { deliveryPhase: 'Production', siteName: 'Bestar CCA' } })
      .expect(200)
      .expect((response) => {
        const body = response.body as OperationalSettingsMutationBody;
        expect(body.audit).toEqual({
          actorUserId: 'auth-admin',
          action: 'settings.update',
          changedKeys: ['deliveryPhase', 'siteName'],
        });
        expect(
          body.settings.fields.find((field) => field.key === 'deliveryPhase'),
        ).toEqual(expect.objectContaining({ value: 'Production' }));
      });
  });

  it('rejects OFFICE updates and invalid ADMIN payloads', async () => {
    await request(app.getHttpServer())
      .patch('/api/settings/operational')
      .set('Authorization', officeAuthHeader())
      .send({ values: { deliveryPhase: 'Production' } })
      .expect(403)
      .expect((response) => {
        expect((response.body as ErrorBody).code).toBe('FORBIDDEN');
      });

    await request(app.getHttpServer())
      .patch('/api/settings/operational')
      .set('Authorization', adminAuthHeader())
      .send({ values: { deliveryPhase: 'Unsupported' } })
      .expect(400)
      .expect((response) => {
        expect((response.body as ErrorBody).code).toBe(
          'SETTING_VALUE_UNSUPPORTED',
        );
      });

    await request(app.getHttpServer())
      .patch('/api/settings/operational')
      .set('Authorization', adminAuthHeader())
      .send({ values: { labelWidthMm: '160' } })
      .expect(400)
      .expect((response) => {
        expect((response.body as ErrorBody).code).toBe('SETTING_NOT_EDITABLE');
      });
  });
});

function createSettingsPrismaMock() {
  const records: SettingRecord[] = [];
  const operationalSetting = {
    findMany: jest.fn((): Promise<SettingRecord[]> => Promise.resolve(records)),
    upsert: jest.fn((args: UpsertArgs): Promise<SettingRecord> => {
      const existing = records.find((record) => record.key === args.where.key);
      const now = new Date('2026-07-01T12:00:00.000Z');
      if (existing) {
        existing.value = args.update.value;
        existing.updatedById = args.update.updatedById;
        existing.updatedAt = now;
        return Promise.resolve(existing);
      }
      const created = {
        key: args.create.key,
        value: args.create.value,
        updatedById: args.create.updatedById,
        updatedAt: now,
      };
      records.push(created);
      return Promise.resolve(created);
    }),
  };

  return {
    operationalSetting,
    $transaction: jest.fn(
      (operations: Array<Promise<unknown>>): Promise<unknown[]> =>
        Promise.all(operations),
    ),
  };
}

interface SettingRecord {
  key: string;
  value: string;
  updatedById: string | null;
  updatedAt: Date;
}

interface UpsertArgs {
  where: { key: string };
  update: { value: string; updatedById: string };
  create: { key: string; value: string; updatedById: string };
}
