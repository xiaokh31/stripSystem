import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from './settings.service';

describe('SettingsService', () => {
  it('returns default operational settings when no overrides exist', async () => {
    const prisma = createPrismaMock();
    const service = new SettingsService(asPrismaService(prisma));

    const settings = await service.getOperationalSettings();

    expect(settings.fields.length).toBeGreaterThan(5);
    expect(
      settings.fields.find((field) => field.key === 'deliveryPhase'),
    ).toMatchObject({
      value: 'P5 Pilot Ready',
      editable: true,
    });
    expect(
      settings.fields.find((field) => field.key === 'labelWidthMm'),
    ).toMatchObject({
      value: '150',
      editable: false,
    });
    expect(
      settings.fields.find((field) => field.key === 'labelHeightMm'),
    ).toMatchObject({
      value: '100',
      editable: false,
    });
    expect(
      settings.fields.find(
        (field) => field.key === 'unloadingWageOceanContainerRateCad',
      ),
    ).toMatchObject({
      value: '300',
      editable: true,
    });
    expect(
      settings.fields.find(
        (field) => field.key === 'unloadingWageUsToCanadaTransferRateCad',
      ),
    ).toMatchObject({
      value: '360',
      editable: true,
    });
    expect(settings.updatedAt).toBeNull();
  });

  it('persists updated settings with the current actor id', async () => {
    const prisma = createPrismaMock();
    const service = new SettingsService(asPrismaService(prisma));

    const response = await service.updateOperationalSettings(
      { values: { deliveryPhase: 'Production', qrTargetSizeMm: '30' } },
      actor(),
    );

    expect(prisma.operationalSetting.upsert).toHaveBeenCalledTimes(2);
    expect(prisma.operationalSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { key: 'deliveryPhase' },
        update: objectContainingRecord({ updatedById: 'admin-user' }),
        create: objectContainingRecord({ value: 'Production' }),
      }),
    );
    expect(response.audit).toEqual({
      actorUserId: 'admin-user',
      action: 'settings.update',
      changedKeys: ['deliveryPhase', 'qrTargetSizeMm'],
    });
  });

  it('rejects unknown setting keys', async () => {
    const service = new SettingsService(asPrismaService(createPrismaMock()));

    await expect(
      service.updateOperationalSettings(
        { values: { unsupported: 'value' } },
        actor(),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects invalid number values', async () => {
    const service = new SettingsService(asPrismaService(createPrismaMock()));

    await expect(
      service.updateOperationalSettings(
        { values: { qrTargetSizeMm: 'too wide' } },
        actor(),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects attempts to edit fixed label dimensions', async () => {
    const service = new SettingsService(asPrismaService(createPrismaMock()));

    await expect(
      service.updateOperationalSettings(
        { values: { labelWidthMm: '160' } },
        actor(),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

function createPrismaMock() {
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

function actor() {
  return {
    id: 'admin-user',
    email: 'admin@example.com',
    name: 'Admin',
    roles: ['ADMIN'],
    permissions: ['settings.update'],
  };
}

interface UpsertArgs {
  where: { key: string };
  update: { value: string; updatedById: string };
  create: { key: string; value: string; updatedById: string };
}

interface SettingRecord {
  key: string;
  value: string;
  updatedById: string | null;
  updatedAt: Date;
}

function asPrismaService(value: unknown): PrismaService {
  return value as PrismaService;
}

function objectContainingRecord<T extends object>(value: T): T {
  return expect.objectContaining(value) as T;
}
