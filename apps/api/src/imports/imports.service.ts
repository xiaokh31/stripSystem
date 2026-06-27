import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import {
  ImportFileListResponseDto,
  ImportFileResponseDto,
} from './dto/import-file-response.dto';
import { ListImportsQueryDto } from './dto/list-imports-query.dto';
import { PrismaService } from '../prisma/prisma.service';

interface ImportFileRecord {
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
  createdAt: Date | string;
  updatedAt: Date | string;
}

@Injectable()
export class ImportsService {
  private readonly storageRoot: string;

  constructor(
    private readonly prisma: PrismaService,
    configService: ConfigService,
  ) {
    this.storageRoot = configService.getOrThrow<string>('app.storageRoot');
  }

  async importFile(file: Express.Multer.File): Promise<ImportFileResponseDto> {
    this.validateXlsx(file);

    const fileSha256 = createHash('sha256').update(file.buffer).digest('hex');
    const duplicate = await this.prisma.importFile.findUnique({
      where: { fileSha256 },
    });

    if (duplicate) {
      this.throwDuplicate(duplicate);
    }

    const storedPath = await this.preserveOriginalFile(file, fileSha256);

    try {
      const record = await this.prisma.importFile.create({
        data: {
          originalFilename: file.originalname,
          storedPath,
          fileSha256,
          mimeType: file.mimetype || null,
          fileSizeBytes: BigInt(file.size),
          format: 'UNKNOWN',
          importStatus: 'UPLOADED',
          parseStatus: 'NOT_PARSED',
          warningCount: 0,
          errorCount: 0,
          errorMessage: null,
        },
      });

      return this.toResponse(record);
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        const existing = await this.prisma.importFile.findUnique({
          where: { fileSha256 },
        });

        if (existing) {
          this.throwDuplicate(existing);
        }
      }

      throw new InternalServerErrorException({
        code: 'IMPORT_CREATE_FAILED',
        message:
          'The uploaded file was preserved, but import metadata could not be saved.',
        details: {
          errorMessage: this.errorMessage(error),
          fileSha256,
          storedPath,
        },
      });
    }
  }

  async list(query: ListImportsQueryDto): Promise<ImportFileListResponseDto> {
    const records = await this.prisma.importFile.findMany({
      orderBy: { createdAt: 'desc' },
      take: query.limit,
      skip: query.offset,
    });

    return {
      items: records.map((record) =>
        this.toResponse(record as ImportFileRecord),
      ),
      limit: query.limit,
      offset: query.offset,
    };
  }

  async getById(id: string): Promise<ImportFileResponseDto> {
    const record = await this.prisma.importFile.findUnique({
      where: { id },
    });

    if (!record) {
      throw new NotFoundException({
        code: 'IMPORT_NOT_FOUND',
        message: `Import file ${id} was not found.`,
        details: { id },
      });
    }

    return this.toResponse(record);
  }

  private validateXlsx(file: Express.Multer.File): void {
    if (!file.originalname.toLowerCase().endsWith('.xlsx')) {
      throw new BadRequestException({
        code: 'INVALID_IMPORT_FILE_TYPE',
        message: 'Only .xlsx import files are accepted.',
        details: {
          originalFilename: file.originalname,
          mimeType: file.mimetype,
        },
      });
    }

    if (!file.buffer || file.buffer.length === 0) {
      throw new BadRequestException({
        code: 'EMPTY_IMPORT_FILE',
        message: 'The uploaded .xlsx file is empty.',
        details: {
          originalFilename: file.originalname,
        },
      });
    }
  }

  private async preserveOriginalFile(
    file: Express.Multer.File,
    fileSha256: string,
  ): Promise<string> {
    const directory = join(this.storageRoot, 'original_files', fileSha256);
    const storedPath = join(directory, this.safeFilename(file.originalname));

    try {
      await mkdir(directory, { recursive: true });
      await writeFile(storedPath, file.buffer, { flag: 'wx' });
    } catch (error) {
      if (this.isFileAlreadyExists(error)) {
        await stat(storedPath);
        return storedPath;
      }

      throw new InternalServerErrorException({
        code: 'IMPORT_FILE_STORAGE_FAILED',
        message: 'The uploaded original file could not be preserved.',
        details: {
          errorMessage: this.errorMessage(error),
          fileSha256,
        },
      });
    }

    return storedPath;
  }

  private throwDuplicate(record: ImportFileRecord): never {
    throw new ConflictException({
      code: 'DUPLICATE_IMPORT',
      message: 'A file with this SHA-256 already exists.',
      details: {
        existingImport: this.toResponse(record),
      },
    });
  }

  private toResponse(record: ImportFileRecord): ImportFileResponseDto {
    return {
      id: record.id,
      originalFilename: record.originalFilename,
      storedPath: record.storedPath,
      fileSha256: record.fileSha256,
      mimeType: record.mimeType,
      fileSizeBytes:
        record.fileSizeBytes === null ? null : record.fileSizeBytes.toString(),
      format: record.format,
      importStatus: record.importStatus,
      parseStatus: record.parseStatus,
      warningCount: record.warningCount,
      errorCount: record.errorCount,
      errorMessage: record.errorMessage,
      createdAt: this.toIsoString(record.createdAt),
      updatedAt: this.toIsoString(record.updatedAt),
    };
  }

  private safeFilename(originalFilename: string): string {
    const filename = basename(originalFilename).replace(/[\\/:*?"<>|]/g, '_');
    return filename.length > 0 ? filename : 'upload.xlsx';
  }

  private toIsoString(value: Date | string): string {
    return value instanceof Date ? value.toISOString() : value;
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2002'
    );
  }

  private isFileAlreadyExists(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'EEXIST'
    );
  }

  private errorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    return 'Unknown error';
  }
}
