import { ConflictException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { ImportsService } from './imports.service';
import { PrismaService } from '../prisma/prisma.service';

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
  warningCount: number;
  errorCount: number;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
}

describe('ImportsService', () => {
  const fixturePath = resolve(
    process.cwd(),
    '..',
    '..',
    'samples',
    'unloading-plans',
    'Unloading Plan CSNU8877228.xlsx',
  );

  let storageRoot: string;
  let prisma: {
    importFile: {
      findUnique: jest.Mock;
      create: jest.Mock;
      findMany: jest.Mock;
    };
  };
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
      importFile: {
        findUnique: jest.fn(),
        create: jest.fn(),
        findMany: jest.fn(),
      },
    };
    service = new ImportsService(
      prisma as unknown as PrismaService,
      {
        getOrThrow: jest.fn((key: string) => {
          if (key === 'app.storageRoot') {
            return storageRoot;
          }
          throw new Error(`Unexpected config key ${key}`);
        }),
      } as unknown as ConfigService,
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

    const response = await service.importFile(file);

    expect(response).toMatchObject({
      id: 'import-1',
      originalFilename: 'Unloading Plan CSNU8877228.xlsx',
      fileSha256: expectedSha256,
      format: 'UNKNOWN',
      importStatus: 'UPLOADED',
      parseStatus: 'NOT_PARSED',
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
      warningCount: 0,
      errorCount: 0,
      errorMessage: null,
      createdAt: new Date('2026-06-26T00:00:00.000Z'),
      updatedAt: new Date('2026-06-26T00:00:00.000Z'),
    } satisfies ImportRecord);

    await expect(service.importFile(file)).rejects.toBeInstanceOf(
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

    await expect(service.importFile(file)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.importFile.findUnique).not.toHaveBeenCalled();
    expect(prisma.importFile.create).not.toHaveBeenCalled();
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
});
