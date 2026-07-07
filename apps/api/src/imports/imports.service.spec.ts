import { ConflictException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { ImportsService } from './imports.service';

interface ImportRecord {
  id: string;
  originalFilename: string;
  storedPath: string;
  fileSha256: string;
  mimeType: string | null;
  fileSizeBytes: bigint | number | string | null;
  format: string;
  importStatus: string;
  parseStatus: string;
  parserVersion: string | null;
  warningCount: number;
  errorCount: number;
  errorMessage: string | null;
  rawMetadata: unknown;
  importedById?: string | null;
  deletedAt?: Date | string | null;
  deletedById?: string | null;
  deleteReason?: string | null;
  containers?: Array<{ id: string; containerNo: string }>;
  createdAt: Date;
  updatedAt: Date;
}

describe('ImportsService', () => {
  const officeActor = {
    id: 'auth-office',
    email: 'office@example.com',
    name: 'Office User',
    roles: ['OFFICE'],
    permissions: ['imports.create', 'imports.parse'],
  };
  const fixturePath = resolve(
    process.cwd(),
    '..',
    '..',
    'samples',
    'unloading-plans',
    'Unloading Plan CSNU8877228.xlsx',
  );

  let storageRoot: string;
  let prisma: any;
  let workerParser: { parseFile: jest.Mock };
  let createdImportData:
    | {
        storedPath: string;
        fileSha256: string;
        originalFilename: string;
      }
    | undefined;
  let service: ImportsService;

  beforeEach(async () => {
    storageRoot = await mkdtemp(join(tmpdir(), 'p1-03-imports-service-'));
    prisma = {
      $transaction: jest.fn((callback) => callback(prisma)),
      importFile: {
        findUnique: jest.fn(),
        create: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      container: {
        findMany: jest.fn(),
        create: jest.fn(),
        deleteMany: jest.fn(),
      },
      containerLine: {
        createMany: jest.fn(),
        deleteMany: jest.fn(),
      },
      containerDestination: {
        createMany: jest.fn(),
        deleteMany: jest.fn(),
      },
      correctionFeedback: {
        count: jest.fn(),
        create: jest.fn(),
      },
      generatedFile: {
        count: jest.fn(),
      },
      loadJob: {
        count: jest.fn(),
      },
      pallet: {
        count: jest.fn(),
      },
    };
    workerParser = { parseFile: jest.fn() };
    service = new ImportsService(
      prisma,
      {
        getOrThrow: jest.fn((key: string) => {
          if (key === 'app.storageRoot') {
            return storageRoot;
          }
          throw new Error(`Unexpected config key ${key}`);
        }),
      } as unknown as ConfigService,
      workerParser as never,
    );
  });

  it('preserves a real xlsx fixture and writes import metadata', async () => {
    const file = await loadFixtureFile();
    const expectedSha256 = createHash('sha256')
      .update(file.buffer)
      .digest('hex');

    prisma.importFile.findUnique.mockResolvedValue(null);
    prisma.importFile.create.mockImplementation(({ data }) => {
      createdImportData = data as typeof createdImportData;
      return Promise.resolve({
        id: 'import-1',
        ...data,
        createdAt: new Date('2026-06-26T00:00:00.000Z'),
        updatedAt: new Date('2026-06-26T00:00:00.000Z'),
      });
    });

    const response = await service.importFile(file, officeActor);

    expect(response).toMatchObject({
      id: 'import-1',
      originalFilename: 'Unloading Plan CSNU8877228.xlsx',
      fileSha256: expectedSha256,
      format: 'UNKNOWN',
      importStatus: 'UPLOADED',
      parseStatus: 'NOT_PARSED',
      parserVersion: null,
      errorMessage: null,
    });
    expect(response.storedPath).toContain(
      join('original_files', expectedSha256),
    );
    await expect(stat(response.storedPath)).resolves.toBeDefined();
    await expect(readFile(response.storedPath)).resolves.toEqual(file.buffer);
    expect(createdImportData).toMatchObject({
      storedPath: response.storedPath,
      fileSha256: expectedSha256,
      originalFilename: 'Unloading Plan CSNU8877228.xlsx',
      importedById: 'auth-office',
    });
  });

  it('rejects a duplicate SHA-256 before writing another file record', async () => {
    const file = await loadFixtureFile();
    const fileSha256 = createHash('sha256').update(file.buffer).digest('hex');

    prisma.importFile.findUnique.mockResolvedValue({
      id: 'existing-import',
      originalFilename: file.originalname,
      storedPath: join(
        storageRoot,
        'original_files',
        fileSha256,
        file.originalname,
      ),
      fileSha256,
      mimeType: file.mimetype,
      fileSizeBytes: BigInt(file.size),
      format: 'UNKNOWN',
      importStatus: 'UPLOADED',
      parseStatus: 'NOT_PARSED',
      parserVersion: null,
      warningCount: 0,
      errorCount: 0,
      errorMessage: null,
      rawMetadata: null,
      createdAt: new Date('2026-06-26T00:00:00.000Z'),
      updatedAt: new Date('2026-06-26T00:00:00.000Z'),
    } satisfies ImportRecord);

    await expect(service.importFile(file, officeActor)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(prisma.importFile.create).not.toHaveBeenCalled();
  });

  it('rejects non-xlsx uploads without database writes', async () => {
    const file = {
      originalname: 'not-a-plan.txt',
      mimetype: 'text/plain',
      size: 5,
      buffer: Buffer.from('hello'),
    } as Express.Multer.File;

    await expect(service.importFile(file, officeActor)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.importFile.findUnique).not.toHaveBeenCalled();
    expect(prisma.importFile.create).not.toHaveBeenCalled();
  });

  it('soft deletes an unused bad import and writes correction feedback audit', async () => {
    const record = importRecord({
      id: 'import-delete',
      containers: [],
    });

    prisma.importFile.findUnique.mockResolvedValue(record);
    prisma.generatedFile.count.mockResolvedValue(0);
    prisma.pallet.count.mockResolvedValue(0);
    prisma.loadJob.count.mockResolvedValue(0);
    prisma.correctionFeedback.count.mockResolvedValue(0);
    prisma.importFile.update.mockImplementation(({ data }) =>
      Promise.resolve({
        ...record,
        ...data,
        containers: [],
        updatedAt: new Date('2026-06-26T00:02:00.000Z'),
      }),
    );
    prisma.correctionFeedback.create.mockResolvedValue({
      id: 'correction-delete',
    });

    const result = await service.delete(
      record.id,
      { reason: 'Wrong customer file' },
      officeActor,
    );

    expect(result).toMatchObject({
      id: 'import-delete',
      deletedById: 'auth-office',
      deleteReason: 'Wrong customer file',
    });
    expect(result.deletedAt).toEqual(expect.any(String));
    expect(prisma.container.deleteMany).not.toHaveBeenCalled();
    expect(prisma.importFile.update).toHaveBeenCalledWith({
      where: { id: record.id },
      data: {
        deletedAt: expect.any(Date),
        deletedById: 'auth-office',
        deleteReason: 'Wrong customer file',
      },
      include: expect.any(Object),
    });
    expect(prisma.correctionFeedback.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        correctedById: 'auth-office',
        fieldName: 'deletedAt',
        importFileId: record.id,
        reason: 'Wrong customer file',
        targetType: 'IMPORT_FILE',
      }),
    });
  });

  it('blocks deleting an import that already has business records', async () => {
    const record = importRecord({
      id: 'import-in-use',
      containers: [{ id: 'container-1', containerNo: 'CSNU8877228' }],
    });

    prisma.importFile.findUnique.mockResolvedValue(record);
    prisma.generatedFile.count.mockResolvedValue(1);
    prisma.pallet.count.mockResolvedValue(0);
    prisma.loadJob.count.mockResolvedValue(0);
    prisma.correctionFeedback.count.mockResolvedValue(0);

    await expect(
      service.delete(record.id, { reason: 'Wrong file' }, officeActor),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.importFile.update).not.toHaveBeenCalled();
    expect(prisma.container.deleteMany).not.toHaveBeenCalled();
  });

  it('calls the worker parser for a stored real fixture and persists parsed rows', async () => {
    const file = await loadFixtureFile();
    const storedPath = join(storageRoot, 'Unloading Plan CSNU8877228.xlsx');
    await writeFile(storedPath, file.buffer);
    const record = importRecord({
      id: 'import-parse',
      originalFilename: file.originalname,
      storedPath,
      fileSha256: createHash('sha256').update(file.buffer).digest('hex'),
    });
    const containers: any[] = [];
    const lines: any[] = [];
    const destinations: any[] = [];

    prisma.importFile.findUnique.mockResolvedValue(record);
    prisma.importFile.update.mockImplementation(({ data }) => {
      Object.assign(record, data, {
        updatedAt: new Date('2026-06-26T00:01:00.000Z'),
      });
      return Promise.resolve(record);
    });
    prisma.container.findMany.mockImplementation(({ where, include }) => {
      const found = containers.filter(
        (container) => container.importFileId === where.importFileId,
      );
      if (!include) {
        return Promise.resolve(
          found.map((container) => ({ id: container.id })),
        );
      }

      return Promise.resolve(
        found.map((container) => ({
          ...container,
          lines: lines.filter((line) => line.containerId === container.id),
          destinations: destinations.filter(
            (destination) => destination.containerId === container.id,
          ),
        })),
      );
    });
    prisma.container.create.mockImplementation(({ data }) => {
      const container = {
        id: 'container-1',
        ...data,
        createdAt: new Date('2026-06-26T00:01:00.000Z'),
        updatedAt: new Date('2026-06-26T00:01:00.000Z'),
      };
      containers.push(container);
      return Promise.resolve(container);
    });
    prisma.containerLine.createMany.mockImplementation(({ data }) => {
      lines.push(
        ...data.map((line, index) => ({
          id: `line-${index + 1}`,
          ...line,
          createdAt: new Date('2026-06-26T00:01:00.000Z'),
          updatedAt: new Date('2026-06-26T00:01:00.000Z'),
        })),
      );
      return Promise.resolve({ count: data.length });
    });
    prisma.containerDestination.createMany.mockImplementation(({ data }) => {
      destinations.push(
        ...data.map((destination, index) => ({
          id: `destination-${index + 1}`,
          ...destination,
          createdAt: new Date('2026-06-26T00:01:00.000Z'),
          updatedAt: new Date('2026-06-26T00:01:00.000Z'),
        })),
      );
      return Promise.resolve({ count: data.length });
    });
    workerParser.parseFile.mockResolvedValue({
      task_status: 'WARNING',
      source_file: storedPath,
      sha256: record.fileSha256,
      detection: { format_type: 'UNLOADING_PLAN_CN' },
      parsed_result: {
        containerNo: 'CSNU8877228',
        formatType: 'UNLOADING_PLAN_CN',
        parserVersion: 'unloading-plan-cn-v1',
        lines: [
          {
            rowNumber: 2,
            destinationCode: 'YYZ',
            packageType: 'CARTON',
            deliveryMethod: 'LTL',
            cartons: 12,
            volumeCbm: 1.25,
            raw_json: { 仓库代码: 'YYZ', 件数: 12 },
          },
        ],
        destinationSummaries: [
          {
            destinationCode: 'YYZ',
            packageType: 'CARTON',
            totalCartons: 12,
            totalVolumeCbm: 1.25,
            lineCount: 1,
          },
        ],
        warnings: [],
        errors: [],
        rawMetadata: { matchedSheet: 'Sheet1' },
      },
      pallet_result: {
        plans: [
          {
            destinationCode: 'YYZ',
            destinationType: 'UNKNOWN',
            packageType: 'CARTON',
            ruleCode: 'ADDRESS_CARTON_VOLUME_1_8',
            calculationBasisCbm: 1.8,
            roundingMode: 'CEIL',
            totalCartons: 12,
            totalVolumeCbm: 1.25,
            calculatedPallets: 1,
            manualPallets: null,
            finalPallets: 1,
            warnings: [],
          },
        ],
        warnings: [{ code: 'NEED_CONFIRM_DESTINATION_TYPE', message: 'Check' }],
        errors: [],
      },
      warnings: [{ code: 'NEED_CONFIRM_DESTINATION_TYPE', message: 'Check' }],
      errors: [],
      exception: null,
    });

    const result = await service.parse(record.id, officeActor);

    expect(workerParser.parseFile).toHaveBeenCalledWith(storedPath);
    expect(result.importFile).toMatchObject({
      id: record.id,
      storedPath,
      parseStatus: 'WARNING',
      parserVersion: 'unloading-plan-cn-v1',
      warningCount: 1,
      errorCount: 0,
    });
    expect(result.containers).toHaveLength(1);
    expect(result.containers[0]).toMatchObject({
      containerNo: 'CSNU8877228',
      sourceFormat: 'UNLOADING_PLAN_CN',
      parserVersion: 'unloading-plan-cn-v1',
      status: 'PARSED',
    });
    expect(result.containers[0].lines).toHaveLength(1);
    expect(result.containers[0].destinations).toMatchObject([
      {
        destinationCode: 'YYZ',
        packageType: 'CARTON',
        cartons: 12,
        calculatedPallets: 1,
        finalPallets: 1,
        palletRuleCode: 'ADDRESS_CARTON_VOLUME_1_8',
        calculationBasisCbm: '1.800',
        roundingMode: 'CEIL',
      },
    ]);
    expect(destinations[0]).toMatchObject({
      packageType: 'CARTON',
      palletRuleCode: 'ADDRESS_CARTON_VOLUME_1_8',
      calculationBasisCbm: '1.800',
      roundingMode: 'CEIL',
    });
  });

  async function loadFixtureFile(): Promise<Express.Multer.File> {
    const buffer = await readFile(fixturePath);

    return {
      originalname: 'Unloading Plan CSNU8877228.xlsx',
      mimetype:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      size: buffer.length,
      buffer,
    } as Express.Multer.File;
  }

  function importRecord(overrides: Partial<ImportRecord>): ImportRecord {
    return {
      id: 'import-1',
      originalFilename: 'Unloading Plan CSNU8877228.xlsx',
      storedPath: join(storageRoot, 'original.xlsx'),
      fileSha256: 'sha256',
      mimeType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      fileSizeBytes: BigInt(100),
      format: 'UNKNOWN',
      importStatus: 'UPLOADED',
      parseStatus: 'NOT_PARSED',
      parserVersion: null,
      warningCount: 0,
      errorCount: 0,
      errorMessage: null,
      rawMetadata: null,
      importedById: null,
      deletedAt: null,
      deletedById: null,
      deleteReason: null,
      createdAt: new Date('2026-06-26T00:00:00.000Z'),
      updatedAt: new Date('2026-06-26T00:00:00.000Z'),
      ...overrides,
    };
  }
});
