import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { basename, join, resolve, sep } from 'node:path';
import { auditUserId } from '../auth/audit-user';
import type { AuthenticatedUser } from '../auth/auth-user';
import {
  ContainerPayClassification,
  ContainerStatus,
  GeneratedFileStatus,
  GeneratedFileType,
} from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import type { GeneratedFileDownloadDto } from '../reports/dto/generated-file-response.dto';
import {
  ExportUnloadingSummaryResponseDto,
  UnloadingSummaryGeneratedFileDto,
  UnloadingSummaryResponseDto,
  UnloadingSummaryReviewItemDto,
  UnloadingSummaryRowDto,
} from './dto/unloading-summary.dto';
import { WorkerUnloadingSummaryService } from './worker-unloading-summary.service';

const SUMMARY_EXCEL_MIME_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const COMPLETED_UNLOADING_STATUS_VALUES = [
  ContainerStatus.UNLOADED,
  ContainerStatus.LOADING_IN_PROGRESS,
  ContainerStatus.LOADED,
] as const;
const COMPLETED_UNLOADING_STATUSES = new Set<string>(
  COMPLETED_UNLOADING_STATUS_VALUES,
);

interface PayContainerSummaryRecord {
  id: string;
  payContainerNo: string;
  classification: string;
  trailerNumber: string | null;
  status: string;
  completedAt: Date | string | null;
  sourceContainers?: PayContainerSourceRecord[];
}

interface PayContainerSourceRecord {
  id: string;
  containerId: string;
  containerNo: string;
  container: ContainerSummaryRecord;
}

interface ContainerSummaryRecord {
  id: string;
  containerNo: string;
  status: string;
  payClassification: string | null;
  payTrailerNumber: string | null;
  rawJson: unknown;
  destinations?: ContainerDestinationSummaryRecord[];
  lines?: ContainerLineSummaryRecord[];
  payContainerLinks?: Array<{
    id: string;
    payContainerId: string;
    containerId: string;
    containerNo: string;
    payContainer: {
      id: string;
      payContainerNo: string;
      completedAt: Date | string | null;
      status: string;
    };
  }>;
}

interface ContainerDestinationSummaryRecord {
  id: string;
  destinationCode: string;
  destinationType: string | null;
  cartons: number;
  calculatedPallets: number;
  manualPallets: number | null;
  finalPallets: number;
  note: string | null;
  warnings: unknown;
  errors: unknown;
}

interface ContainerLineSummaryRecord {
  id: string;
  lineNo: number;
  destinationCode: string | null;
  destinationType: string | null;
  cartons: number | null;
  rawJson: unknown;
}

interface GeneratedFileRecord {
  id: string;
  importFileId: string | null;
  containerId: string | null;
  fileType: string;
  storagePath: string;
  fileSha256: string | null;
  mimeType: string | null;
  fileSizeBytes: bigint | number | string | null;
  status: string;
  errorMessage: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

interface SummaryBuildResult {
  month: string;
  rows: UnloadingSummaryRowDto[];
  reviewItems: UnloadingSummaryReviewItemDto[];
  sourceContainerCount: number;
}

@Injectable()
export class UnloadingSummaryService {
  private readonly storageRoot: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly workerSummary: WorkerUnloadingSummaryService,
    configService: ConfigService,
  ) {
    this.storageRoot = configService.getOrThrow<string>('app.storageRoot');
  }

  async getSummary(month: string): Promise<UnloadingSummaryResponseDto> {
    const summary = await this.buildSummary(month);
    const generatedFiles = await this.listGeneratedFiles(month);
    return {
      month,
      sourceContainerCount: summary.sourceContainerCount,
      rowCount: summary.rows.length,
      rows: summary.rows,
      reviewItems: summary.reviewItems,
      generatedFiles,
    };
  }

  async exportSummary(
    month: string,
    actor: AuthenticatedUser,
  ): Promise<ExportUnloadingSummaryResponseDto> {
    const summary = await this.buildSummary(month);
    const exportId = randomUUID();
    const outputDir = join(
      this.storageRoot,
      'unloading_summary',
      month,
      exportId,
    );
    const payload = await this.workerSummary.writeSummary(
      {
        month,
        rows: summary.rows,
        reviewItems: summary.reviewItems,
      },
      outputDir,
    );
    const result = payload.summary_result;
    const outputPath = result?.outputPath;
    const exportErrors = this.arrayValue(result?.errors);

    if (
      payload.task_status === 'ERROR' ||
      exportErrors.length > 0 ||
      !outputPath
    ) {
      throw new InternalServerErrorException({
        code: 'UNLOADING_SUMMARY_EXPORT_FAILED',
        message: 'Monthly unloading summary workbook export failed.',
        details: {
          month,
          workerPayload: payload,
        },
      });
    }

    const generatedFile = await this.recordGeneratedFile(
      outputPath,
      auditUserId(actor),
    );
    const generatedFiles = await this.listGeneratedFiles(month);

    return {
      month,
      sourceContainerCount: summary.sourceContainerCount,
      rowCount: summary.rows.length,
      rows: summary.rows,
      reviewItems: summary.reviewItems,
      generatedFile: this.toGeneratedFileResponse(generatedFile),
      generatedFiles,
      exportWarnings: this.arrayValue(result?.warnings),
      exportErrors,
    };
  }

  async downloadExport(fileId: string): Promise<GeneratedFileDownloadDto> {
    const record = (await this.prisma.generatedFile.findFirst({
      where: {
        id: fileId,
        fileType: GeneratedFileType.MONTHLY_UNLOADING_SUMMARY_XLSX,
      },
    })) as GeneratedFileRecord | null;

    if (!record) {
      throw new NotFoundException({
        code: 'UNLOADING_SUMMARY_EXPORT_NOT_FOUND',
        message: `Monthly unloading summary export ${fileId} was not found.`,
        details: { fileId },
      });
    }

    if (record.status !== GeneratedFileStatus.GENERATED) {
      throw new BadRequestException({
        code: 'UNLOADING_SUMMARY_EXPORT_NOT_DOWNLOADABLE',
        message: `Monthly unloading summary export ${fileId} is not downloadable because its status is ${record.status}.`,
        details: {
          fileId,
          status: record.status,
          errorMessage: record.errorMessage,
        },
      });
    }

    const storagePath = this.resolveDownloadStoragePath(record.storagePath);
    try {
      const fileStat = await stat(storagePath);
      if (!fileStat.isFile()) {
        throw new Error('Generated path is not a file.');
      }

      return {
        buffer: await readFile(storagePath),
        filename: basename(storagePath),
        fileSizeBytes: fileStat.size,
        mimeType: record.mimeType ?? SUMMARY_EXCEL_MIME_TYPE,
      };
    } catch (error) {
      throw new InternalServerErrorException({
        code: 'UNLOADING_SUMMARY_EXPORT_STORAGE_MISSING',
        message:
          'The monthly unloading summary export record exists, but the file cannot be read.',
        details: {
          fileId,
          storagePath: record.storagePath,
          errorMessage: this.errorMessage(error),
        },
      });
    }
  }

  private async buildSummary(month: string): Promise<SummaryBuildResult> {
    const payContainers = (await this.prisma.payContainer.findMany({
      where: { completedAt: this.monthRange(month) },
      include: {
        sourceContainers: {
          orderBy: { containerNo: 'asc' },
          include: {
            container: {
              include: {
                destinations: {
                  orderBy: [
                    { destinationCode: 'asc' },
                    { destinationType: 'asc' },
                  ],
                },
                lines: { orderBy: { lineNo: 'asc' } },
              },
            },
          },
        },
      },
      orderBy: [{ completedAt: 'asc' }, { payContainerNo: 'asc' }],
    })) as PayContainerSummaryRecord[];

    const reviewItems = await this.missingCompletionReviewItems();
    const rows: UnloadingSummaryRowDto[] = [];
    const includedContainerIds = new Set<string>();
    let sequence = 1;

    for (const payContainer of payContainers) {
      if (!payContainer.completedAt) {
        continue;
      }
      if (payContainer.status === 'DRAFT') {
        reviewItems.push({
          code: 'PAY_CONTAINER_DRAFT_WITH_COMPLETED_AT',
          message:
            'Pay container has a completed date but is still DRAFT; review before export.',
          payContainerId: payContainer.id,
          payContainerNo: payContainer.payContainerNo,
          field: 'status',
        });
      }

      for (const source of payContainer.sourceContainers ?? []) {
        const container = source.container;
        if (!COMPLETED_UNLOADING_STATUSES.has(container.status)) {
          reviewItems.push({
            code: 'SOURCE_CONTAINER_NOT_COMPLETED_UNLOADING_STATUS',
            message:
              'Pay container has a completion date, but this source container is not in a completed unloading status and was excluded from the summary.',
            containerId: container.id,
            containerNo: container.containerNo,
            status: container.status,
            payContainerId: payContainer.id,
            payContainerNo: payContainer.payContainerNo,
            field: 'status',
          });
          continue;
        }

        rows.push(...this.rowsForContainer(sequence, container, payContainer));
        includedContainerIds.add(container.id);
        sequence += 1;
      }
    }
    reviewItems.push(...this.rowReviewItems(rows));

    return {
      month,
      rows,
      reviewItems,
      sourceContainerCount: includedContainerIds.size,
    };
  }

  private rowsForContainer(
    sequence: number,
    container: ContainerSummaryRecord,
    payContainer: PayContainerSummaryRecord,
  ): UnloadingSummaryRowDto[] {
    const completedAt = this.dateTimeRequired(payContainer.completedAt);
    const businessTag = this.businessTag(payContainer.classification);
    const destinations = container.destinations ?? [];
    if (destinations.length === 0) {
      return [
        this.summaryRow({
          sequence,
          container,
          payContainer,
          businessTag,
          completedAt,
          destination: null,
        }),
      ];
    }

    return destinations.map((destination) =>
      this.summaryRow({
        sequence,
        container,
        payContainer,
        businessTag,
        completedAt,
        destination,
      }),
    );
  }

  private summaryRow(input: {
    sequence: number;
    container: ContainerSummaryRecord;
    payContainer: PayContainerSummaryRecord;
    businessTag: string;
    completedAt: Date;
    destination: ContainerDestinationSummaryRecord | null;
  }): UnloadingSummaryRowDto {
    const line = input.destination
      ? this.matchingLine(input.container.lines ?? [], input.destination)
      : null;
    const rawSources = [
      input.destination?.note,
      line?.rawJson,
      input.container.rawJson,
      input.destination?.warnings,
      input.destination?.errors,
    ];
    const referenceText = this.firstTextByKey(rawSources, [
      /reference/i,
      /\bref\b/i,
      /shipment/i,
      /appointment.*no/i,
      /预约号/,
      /参考/,
      /单号/,
    ]);
    const appointmentText = this.firstTextByKey(rawSources, [
      /appointment/i,
      /scheduled/i,
      /unloading.*time/i,
      /\btime\b/i,
      /预约/,
      /拆柜时间/,
    ]);
    const operationNote =
      this.stringOrNull(input.destination?.note) ??
      this.firstTextByKey(rawSources, [/note/i, /remark/i, /备注/]);
    const finalPallets = input.destination?.finalPallets ?? 0;
    const cartons = input.destination?.cartons ?? 0;

    return {
      sequence: input.sequence,
      containerId: input.container.id,
      containerNo: input.container.containerNo,
      status: input.container.status,
      payContainerId: input.payContainer.id,
      payContainerNo: input.payContainer.payContainerNo,
      classification: input.payContainer.classification,
      businessTag: input.businessTag,
      trailerNumber: input.payContainer.trailerNumber,
      completedAt: input.completedAt.toISOString(),
      dateBusinessTag: this.dateBusinessTag(
        input.completedAt,
        input.businessTag,
      ),
      destinationId: input.destination?.id ?? null,
      destinationText: this.destinationText(input.destination),
      destinationCode: input.destination?.destinationCode ?? null,
      destinationType: input.destination?.destinationType ?? null,
      cartons,
      finalPallets,
      quantityText: this.quantityText(cartons, finalPallets),
      referenceText,
      appointmentText,
      splitOrVarianceText: this.splitOrVarianceText(input.destination),
      operationNote,
      rawJson: this.jsonReady({
        containerRawJson: input.container.rawJson ?? null,
        lineRawJson: line?.rawJson ?? null,
        destinationWarnings: input.destination?.warnings ?? null,
        destinationErrors: input.destination?.errors ?? null,
      }),
    };
  }

  private async missingCompletionReviewItems(): Promise<
    UnloadingSummaryReviewItemDto[]
  > {
    const containers = (await this.prisma.container.findMany({
      where: {
        status: { in: [...COMPLETED_UNLOADING_STATUS_VALUES] },
      },
      include: {
        payContainerLinks: {
          include: {
            payContainer: true,
          },
        },
      },
      orderBy: { containerNo: 'asc' },
    })) as ContainerSummaryRecord[];

    return containers
      .filter((container) =>
        (container.payContainerLinks ?? []).every(
          (link) => !link.payContainer.completedAt,
        ),
      )
      .map((container) => ({
        code: 'MISSING_UNLOADING_COMPLETED_AT',
        message:
          'Container is in a completed unloading status but has no unloading completed date; it was not assigned to the selected month.',
        containerId: container.id,
        containerNo: container.containerNo,
        status: container.status,
        field: 'completedAt',
      }));
  }

  private rowReviewItems(
    rows: UnloadingSummaryRowDto[],
  ): UnloadingSummaryReviewItemDto[] {
    const reviewItems: UnloadingSummaryReviewItemDto[] = [];
    for (const row of rows) {
      if (!row.destinationCode) {
        reviewItems.push({
          code: 'MISSING_DESTINATION',
          message:
            'Container has completed unloading but no destination rows for monthly summary review.',
          containerId: row.containerId,
          containerNo: row.containerNo,
          status: row.status,
          payContainerId: row.payContainerId,
          payContainerNo: row.payContainerNo,
          field: 'destination',
        });
      }
      if (!row.referenceText) {
        reviewItems.push({
          code: 'MISSING_REFERENCE_TEXT',
          message:
            'Reference, appointment number, shipment, or raw note is missing for this summary row.',
          containerId: row.containerId,
          containerNo: row.containerNo,
          status: row.status,
          payContainerId: row.payContainerId,
          payContainerNo: row.payContainerNo,
          field: 'referenceText',
        });
      }
      if (!row.appointmentText) {
        reviewItems.push({
          code: 'MISSING_APPOINTMENT_TEXT',
          message:
            'Appointment or unloading time is missing for this summary row.',
          containerId: row.containerId,
          containerNo: row.containerNo,
          status: row.status,
          payContainerId: row.payContainerId,
          payContainerNo: row.payContainerNo,
          field: 'appointmentText',
        });
      }
    }
    return reviewItems;
  }

  private async listGeneratedFiles(
    month: string,
  ): Promise<UnloadingSummaryGeneratedFileDto[]> {
    const records = (await this.prisma.generatedFile.findMany({
      where: {
        fileType: GeneratedFileType.MONTHLY_UNLOADING_SUMMARY_XLSX,
      },
      orderBy: { createdAt: 'desc' },
    })) as GeneratedFileRecord[];
    const monthMarker = `/unloading_summary/${month}/`;

    return records
      .filter((record) =>
        record.storagePath.replace(/\\/g, '/').includes(monthMarker),
      )
      .map((record) => this.toGeneratedFileResponse(record));
  }

  private async recordGeneratedFile(
    outputPath: string,
    generatedById: string | null,
  ): Promise<GeneratedFileRecord> {
    return await this.prisma.generatedFile.create({
      data: {
        fileType: GeneratedFileType.MONTHLY_UNLOADING_SUMMARY_XLSX,
        storagePath: outputPath,
        fileSha256: await this.fileSha256(outputPath),
        mimeType: SUMMARY_EXCEL_MIME_TYPE,
        fileSizeBytes: await this.fileSize(outputPath),
        status: GeneratedFileStatus.GENERATED,
        errorMessage: null,
        generatedById,
      },
    });
  }

  private matchingLine(
    lines: ContainerLineSummaryRecord[],
    destination: ContainerDestinationSummaryRecord,
  ): ContainerLineSummaryRecord | null {
    return (
      lines.find(
        (line) =>
          line.destinationCode === destination.destinationCode &&
          (line.destinationType ?? null) ===
            (destination.destinationType ?? null),
      ) ??
      lines.find(
        (line) => line.destinationCode === destination.destinationCode,
      ) ??
      null
    );
  }

  private destinationText(
    destination: ContainerDestinationSummaryRecord | null,
  ): string {
    if (!destination) {
      return '';
    }
    return destination.destinationType
      ? `${destination.destinationCode} / ${destination.destinationType}`
      : destination.destinationCode;
  }

  private quantityText(cartons: number, finalPallets: number): string {
    if (cartons > 0 && finalPallets > 0) {
      return `${cartons}件 / ${finalPallets}托`;
    }
    if (cartons > 0) {
      return `${cartons}件`;
    }
    if (finalPallets > 0) {
      return `${finalPallets}托`;
    }
    return '0';
  }

  private splitOrVarianceText(
    destination: ContainerDestinationSummaryRecord | null,
  ): string | null {
    if (!destination?.manualPallets) {
      return null;
    }
    if (destination.manualPallets === destination.calculatedPallets) {
      return `manual pallets ${destination.manualPallets}`;
    }
    return `manual pallets ${destination.manualPallets}; calculated ${destination.calculatedPallets}`;
  }

  private businessTag(classification: string | null): string {
    if (classification === ContainerPayClassification.OCEAN_CONTAINER) {
      return '海柜';
    }
    if (classification === ContainerPayClassification.US_TO_CANADA_TRANSFER) {
      return '美转加';
    }
    return classification ?? '未分类';
  }

  private dateBusinessTag(completedAt: Date, businessTag: string): string {
    return `${completedAt.getUTCMonth() + 1}.${completedAt.getUTCDate()}${businessTag}`;
  }

  private monthRange(month: string): { gte: Date; lt: Date } {
    const [yearText, monthText] = month.split('-');
    const year = Number(yearText);
    const monthNumber = Number(monthText);
    return {
      gte: new Date(Date.UTC(year, monthNumber - 1, 1)),
      lt: new Date(Date.UTC(year, monthNumber, 1)),
    };
  }

  private dateTimeRequired(value: Date | string | null): Date {
    if (value instanceof Date) {
      return value;
    }
    if (typeof value === 'string') {
      return new Date(value);
    }
    return new Date(0);
  }

  private firstTextByKey(
    sources: unknown[],
    keyPatterns: RegExp[],
  ): string | null {
    for (const source of sources) {
      const found = this.findTextByKey(source, keyPatterns);
      if (found) {
        return found.slice(0, 500);
      }
    }
    return null;
  }

  private findTextByKey(value: unknown, keyPatterns: RegExp[]): string | null {
    if (value === null || value === undefined) {
      return null;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        const found = this.findTextByKey(item, keyPatterns);
        if (found) {
          return found;
        }
      }
      return null;
    }
    if (typeof value !== 'object') {
      return null;
    }

    for (const [key, item] of Object.entries(
      value as Record<string, unknown>,
    )) {
      if (keyPatterns.some((pattern) => pattern.test(key))) {
        const text = this.stringOrNull(item);
        if (text) {
          return text;
        }
      }
      const nested = this.findTextByKey(item, keyPatterns);
      if (nested) {
        return nested;
      }
    }
    return null;
  }

  private stringOrNull(value: unknown): string | null {
    if (value === undefined || value === null) {
      return null;
    }
    if (value instanceof Date) {
      return value.toISOString();
    }
    if (
      typeof value !== 'string' &&
      typeof value !== 'number' &&
      typeof value !== 'boolean' &&
      typeof value !== 'bigint'
    ) {
      return null;
    }
    const text = value.toString().trim();
    return text.length > 0 ? text : null;
  }

  private jsonReady(value: unknown): unknown {
    const serialized = JSON.stringify(value === undefined ? null : value);
    if (serialized === undefined) {
      return null;
    }
    return JSON.parse(serialized) as unknown;
  }

  private arrayValue(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
  }

  private async fileSha256(path: string): Promise<string | null> {
    try {
      return createHash('sha256')
        .update(await readFile(path))
        .digest('hex');
    } catch {
      return null;
    }
  }

  private async fileSize(path: string): Promise<bigint | null> {
    try {
      const fileStat = await stat(path);
      return BigInt(fileStat.size);
    } catch {
      return null;
    }
  }

  private toGeneratedFileResponse(
    record: GeneratedFileRecord,
  ): UnloadingSummaryGeneratedFileDto {
    return {
      id: record.id,
      importFileId: record.importFileId,
      containerId: record.containerId,
      fileType: record.fileType,
      storagePath: record.storagePath,
      fileSha256: record.fileSha256,
      mimeType: record.mimeType,
      fileSizeBytes:
        record.fileSizeBytes === null || record.fileSizeBytes === undefined
          ? null
          : record.fileSizeBytes.toString(),
      status: record.status,
      errorMessage: record.errorMessage,
      createdAt: this.iso(record.createdAt),
      updatedAt: this.iso(record.updatedAt),
      downloadUrl: `/api/unloading-summary/exports/${record.id}/download`,
    };
  }

  private resolveDownloadStoragePath(storagePath: string): string {
    const resolvedStorageRoot = resolve(this.storageRoot);
    const resolvedPath = resolve(storagePath);
    if (
      resolvedPath === resolvedStorageRoot ||
      resolvedPath.startsWith(`${resolvedStorageRoot}${sep}`)
    ) {
      return resolvedPath;
    }

    const remappedPath = this.remapLegacyStoragePath(storagePath);
    if (remappedPath) {
      return remappedPath;
    }

    throw new BadRequestException({
      code: 'UNLOADING_SUMMARY_EXPORT_STORAGE_PATH_INVALID',
      message:
        'Generated monthly unloading summary path is outside storage root.',
      details: { storagePath },
    });
  }

  private remapLegacyStoragePath(storagePath: string): string | null {
    const normalizedPath = storagePath.replace(/\\/g, '/');
    const marker = '/storage/';
    const markerIndex = normalizedPath.lastIndexOf(marker);
    if (markerIndex === -1) {
      return null;
    }

    const relativePath = normalizedPath.slice(markerIndex + marker.length);
    const candidate = resolve(this.storageRoot, relativePath);
    const resolvedStorageRoot = resolve(this.storageRoot);
    if (
      candidate === resolvedStorageRoot ||
      candidate.startsWith(`${resolvedStorageRoot}${sep}`)
    ) {
      return candidate;
    }

    return null;
  }

  private iso(value: Date | string): string {
    return value instanceof Date
      ? value.toISOString()
      : new Date(value).toISOString();
  }

  private errorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    return 'Unknown unloading summary error';
  }
}
