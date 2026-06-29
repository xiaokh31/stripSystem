import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import {
  ContainerLabelReprintResponseDto,
  GenerateLabelsResponseDto,
  PalletListResponseDto,
  PalletReprintResponseDto,
  PalletResponseDto,
  ReprintAuditEventDto,
} from './dto/label-response.dto';
import {
  WorkerLabelPayload,
  WorkerLabelRequest,
  WorkerLabelService,
} from './worker-label.service';
import { ReprintLabelDto } from './dto/reprint-label.dto';
import {
  ContainerStatus,
  GeneratedFileStatus,
  GeneratedFileType,
  PalletEventType,
  PalletStatus,
} from '../generated/prisma/enums';
import {
  effectiveContainerStatus,
  isContainerGenerationLocked,
  nonReusablePallets,
} from '../common/container-lifecycle';
import { GeneratedFileResponseDto } from '../reports/dto/generated-file-response.dto';
import { PrismaService } from '../prisma/prisma.service';

interface ContainerRecord {
  id: string;
  importFileId: string | null;
  containerNo: string;
  sourceFormat: string;
  parserVersion: string | null;
  company: string | null;
  status: string;
  destinations?: ContainerDestinationRecord[];
}

interface ContainerDestinationRecord {
  id: string;
  containerId: string;
  destinationCode: string;
  destinationType: string | null;
  cartons: number;
  volume: { toString(): string } | number | string;
  calculatedPallets: number;
  manualPallets: number | null;
  finalPallets: number;
  pallets?: Array<{
    id: string;
    status: string;
    loadJobId: string | null;
    loadedAt: Date | string | null;
  }>;
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

interface PalletRecord {
  id: string;
  containerDestinationId: string;
  palletNo: number;
  palletId: string;
  qrPayload: string;
  status: string;
  labelPrintedAt: Date | string | null;
  loadedAt?: Date | string | null;
  loadJobId?: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  containerDestination?: {
    containerId: string;
    destinationCode: string;
    destinationType: string | null;
  };
}

interface PalletEventRecord {
  id: string;
  palletId: string | null;
  eventType: string;
  fromStatus: string | null;
  toStatus: string | null;
  scanPayload: string | null;
  metadata: unknown;
  operatorId: string | null;
  occurredAt: Date | string;
  createdAt: Date | string;
  updatedAt: Date | string;
}

interface PalletDraft {
  containerId: string;
  containerDestinationId: string;
  destinationCode: string;
  destinationType: string | null;
  palletNo: number;
  globalPalletNo: string;
  palletId: string;
  qrPayload: string;
}

interface PersistedLabels {
  generatedFile: GeneratedFileRecord;
  pallets: PalletRecord[];
}

const PDF_MIME_TYPE = 'application/pdf';
const MANUAL_DESTINATION = 'NEED_MANUAL_DESTINATION';

@Injectable()
export class LabelsService {
  private readonly storageRoot: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly workerLabel: WorkerLabelService,
    configService: ConfigService,
  ) {
    this.storageRoot = configService.getOrThrow<string>('app.storageRoot');
  }

  async generateLabels(id: string): Promise<GenerateLabelsResponseDto> {
    const container = await this.findContainerOrThrow(id, true);
    this.assertCanRegeneratePallets(container);

    const labelDate = this.labelDate();
    const drafts = this.buildPalletDrafts(container, labelDate);
    if (drafts.length === 0) {
      throw new BadRequestException({
        code: 'NO_PALLETS_TO_LABEL',
        message: `Container ${id} has no final pallets to label.`,
        details: { id },
      });
    }

    const outputDir = join(this.storageRoot, 'labels');
    const request = this.toWorkerLabelRequest(container, drafts);

    let payload: WorkerLabelPayload;
    try {
      payload = await this.workerLabel.writeLabels(
        request,
        outputDir,
        labelDate,
      );
    } catch (error) {
      const failed = await this.recordFailedGeneratedFile(
        container,
        this.failureStoragePath(container),
        error,
      );
      throw this.labelFailure(error, failed);
    }

    const outputPath = this.outputPathFromPayload(payload);
    const errors = this.issueArray(payload.errors);
    if (payload.task_status === 'ERROR' || errors.length > 0 || !outputPath) {
      const failed = await this.recordFailedGeneratedFile(
        container,
        outputPath ?? this.failureStoragePath(container),
        payload,
      );
      throw this.labelFailure(payload, failed);
    }

    if (!this.workerQrPayloadsMatch(payload, drafts)) {
      const failed = await this.recordFailedGeneratedFile(
        container,
        outputPath,
        new Error('Worker QR payloads did not match persisted pallet records.'),
      );
      throw this.labelFailure(payload, failed);
    }

    const printedAt = new Date();
    const persisted = await this.replacePalletsAndRecordGeneratedLabels(
      container,
      drafts,
      outputPath,
      printedAt,
    );

    return {
      generatedFile: this.toGeneratedFileResponse(persisted.generatedFile),
      pallets: persisted.pallets.map((pallet, index) =>
        this.toPalletResponse(pallet, drafts[index], {
          status: PalletStatus.LABEL_PRINTED,
          labelPrintedAt: printedAt,
        }),
      ),
      warnings: this.issueArray(payload.warnings),
      errors: [],
    };
  }

  async listPallets(containerId: string): Promise<PalletListResponseDto> {
    await this.findContainerOrThrow(containerId, false);
    const pallets = (await this.prisma.pallet.findMany({
      where: { containerDestination: { containerId } },
      include: {
        containerDestination: {
          select: {
            containerId: true,
            destinationCode: true,
            destinationType: true,
          },
        },
      },
      orderBy: [{ containerDestinationId: 'asc' }, { palletNo: 'asc' }],
    })) as PalletRecord[];

    return {
      items: pallets.map((pallet) => this.toPalletResponse(pallet)),
    };
  }

  async reprintPalletLabel(
    id: string,
    dto: ReprintLabelDto,
  ): Promise<PalletReprintResponseDto> {
    const occurredAt = new Date();
    const supervisorOverride = dto.supervisorOverride === true;

    const { pallet, event } = await this.prisma.$transaction(async (tx) => {
      await this.assertUserExists(
        tx,
        dto.operatorId,
        'REPRINT_OPERATOR_NOT_FOUND',
      );
      const pallet = await this.findPalletOrThrow(tx, id);
      this.assertPalletsCanBeReprinted([pallet], supervisorOverride);
      const event = await this.createReprintEvent(tx, {
        pallet,
        operatorId: dto.operatorId,
        reason: dto.reason,
        occurredAt,
        supervisorOverride,
        scope: 'PALLET',
      });

      return { pallet, event };
    });

    return {
      event: this.toReprintAuditEventResponse({
        event,
        pallet,
        reason: dto.reason,
        supervisorOverride,
      }),
      pallet: this.toPalletResponse(pallet),
    };
  }

  async reprintContainerLabels(
    id: string,
    dto: ReprintLabelDto,
  ): Promise<ContainerLabelReprintResponseDto> {
    const occurredAt = new Date();
    const supervisorOverride = dto.supervisorOverride === true;

    const events = (await this.prisma.$transaction(async (tx) => {
      await this.assertUserExists(
        tx,
        dto.operatorId,
        'REPRINT_OPERATOR_NOT_FOUND',
      );
      await this.findContainerForReprintOrThrow(tx, id);
      const pallets = await this.findContainerPallets(tx, id);
      if (pallets.length === 0) {
        throw new BadRequestException({
          code: 'NO_PALLETS_TO_REPRINT',
          message: `Container ${id} has no pallet labels to reprint.`,
          details: { containerId: id },
        });
      }

      this.assertPalletsCanBeReprinted(pallets, supervisorOverride);

      const records: Array<{
        pallet: PalletRecord;
        event: PalletEventRecord;
      }> = [];
      for (const pallet of pallets) {
        records.push({
          pallet,
          event: await this.createReprintEvent(tx, {
            pallet,
            operatorId: dto.operatorId,
            reason: dto.reason,
            occurredAt,
            supervisorOverride,
            scope: 'CONTAINER',
            containerId: id,
          }),
        });
      }

      return records;
    })) as Array<{ pallet: PalletRecord; event: PalletEventRecord }>;

    return {
      containerId: id,
      eventCount: events.length,
      events: events.map(({ event, pallet }) =>
        this.toReprintAuditEventResponse({
          event,
          pallet,
          reason: dto.reason,
          supervisorOverride,
        }),
      ),
    };
  }

  private async findContainerOrThrow(
    id: string,
    includePallets: boolean,
  ): Promise<ContainerRecord> {
    const container = (await this.prisma.container.findUnique({
      where: { id },
      include: {
        destinations: {
          orderBy: [{ destinationCode: 'asc' }, { destinationType: 'asc' }],
          include: includePallets
            ? {
                pallets: {
                  select: {
                    id: true,
                    status: true,
                    loadJobId: true,
                    loadedAt: true,
                  },
                },
              }
            : undefined,
        },
      },
    })) as ContainerRecord | null;

    if (!container) {
      throw new NotFoundException({
        code: 'CONTAINER_NOT_FOUND',
        message: `Container ${id} was not found.`,
        details: { id },
      });
    }

    return container;
  }

  private async findContainerForReprintOrThrow(
    tx: any,
    id: string,
  ): Promise<void> {
    const container = await tx.container.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!container) {
      throw new NotFoundException({
        code: 'CONTAINER_NOT_FOUND',
        message: `Container ${id} was not found.`,
        details: { id },
      });
    }
  }

  private async findPalletOrThrow(tx: any, id: string): Promise<PalletRecord> {
    const pallet = (await tx.pallet.findUnique({
      where: { id },
      include: {
        containerDestination: {
          select: {
            containerId: true,
            destinationCode: true,
            destinationType: true,
          },
        },
      },
    })) as PalletRecord | null;

    if (!pallet) {
      throw new NotFoundException({
        code: 'PALLET_NOT_FOUND',
        message: `Pallet ${id} was not found.`,
        details: { id },
      });
    }

    return pallet;
  }

  private async findContainerPallets(
    tx: any,
    containerId: string,
  ): Promise<PalletRecord[]> {
    return (await tx.pallet.findMany({
      where: { containerDestination: { containerId } },
      include: {
        containerDestination: {
          select: {
            containerId: true,
            destinationCode: true,
            destinationType: true,
          },
        },
      },
      orderBy: [{ containerDestinationId: 'asc' }, { palletNo: 'asc' }],
    })) as PalletRecord[];
  }

  private async assertUserExists(
    tx: any,
    userId: string,
    code: string,
  ): Promise<void> {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });

    if (!user) {
      throw new NotFoundException({
        code,
        message: `User ${userId} was not found.`,
        details: { userId },
      });
    }
  }

  private assertCanRegeneratePallets(container: ContainerRecord): void {
    const effectiveStatus = effectiveContainerStatus(
      container.status,
      container.destinations ?? [],
    );

    if (isContainerGenerationLocked(effectiveStatus)) {
      throw new ConflictException({
        code: 'CONTAINER_GENERATION_LOCKED',
        message:
          'This container has entered loading or has been loaded, so pallet labels cannot be regenerated.',
        details: {
          containerId: container.id,
          status: effectiveStatus,
          action: 'generate-labels',
        },
      });
    }

    const blocked = nonReusablePallets(container.destinations ?? []);
    if (blocked.length === 0) {
      return;
    }

    throw new ConflictException({
      code: 'PALLETS_ALREADY_IN_USE',
      message:
        'Existing pallets have already entered loading or exception handling and cannot be replaced by regenerating labels.',
      details: {
        containerId: container.id,
        blockedCount: blocked.length,
      },
    });
  }

  private assertPalletsCanBeReprinted(
    pallets: PalletRecord[],
    supervisorOverride: boolean,
  ): void {
    const blocked = pallets.filter(
      (pallet) => pallet.status === PalletStatus.CANCELLED,
    );
    if (blocked.length > 0 && !supervisorOverride) {
      throw new ConflictException({
        code: 'REPRINT_REQUIRES_SUPERVISOR_OVERRIDE',
        message:
          'Cancelled pallets cannot be reprinted without supervisor override.',
        details: {
          blockedCount: blocked.length,
          palletIds: blocked.map((pallet) => pallet.id),
        },
      });
    }
  }

  private async createReprintEvent(
    tx: any,
    input: {
      pallet: PalletRecord;
      operatorId: string;
      reason: string;
      occurredAt: Date;
      supervisorOverride: boolean;
      scope: 'PALLET' | 'CONTAINER';
      containerId?: string;
    },
  ): Promise<PalletEventRecord> {
    return (await tx.palletEvent.create({
      data: {
        palletId: input.pallet.id,
        eventType: PalletEventType.REPRINTED,
        fromStatus: input.pallet.status,
        toStatus: input.pallet.status,
        scanPayload: input.pallet.qrPayload,
        operatorId: input.operatorId,
        occurredAt: input.occurredAt,
        metadata: {
          action: 'PALLET_LABEL_REPRINT',
          scope: input.scope,
          reason: input.reason,
          printedAt: input.occurredAt.toISOString(),
          supervisorOverride: input.supervisorOverride,
          businessPalletId: input.pallet.palletId,
          containerId:
            input.containerId ??
            input.pallet.containerDestination?.containerId ??
            null,
        },
      },
    })) as PalletEventRecord;
  }

  private buildPalletDrafts(
    container: ContainerRecord,
    labelDate: string,
  ): PalletDraft[] {
    const destinations = container.destinations ?? [];
    const totalPallets = destinations.reduce(
      (total, destination) => total + Math.max(0, destination.finalPallets),
      0,
    );
    const drafts: PalletDraft[] = [];
    let globalIndex = 0;

    destinations.forEach((destination, destinationIndex) => {
      const finalPallets = Math.max(0, destination.finalPallets);
      const destinationCode = destination.destinationCode || MANUAL_DESTINATION;

      for (let palletNo = 1; palletNo <= finalPallets; palletNo += 1) {
        globalIndex += 1;
        const globalPalletNo = `${globalIndex}/${totalPallets}`;
        const palletId = this.buildPalletId(
          container,
          destination,
          destinationIndex + 1,
          palletNo,
        );
        const qrPayload = this.buildQrPayload({
          labelDate,
          containerNo: container.containerNo,
          destination: destinationCode,
          palletNo: globalPalletNo,
          palletId,
        });
        drafts.push({
          containerId: container.id,
          containerDestinationId: destination.id,
          destinationCode,
          destinationType: destination.destinationType,
          palletNo,
          globalPalletNo,
          palletId,
          qrPayload,
        });
      }
    });

    return drafts;
  }

  private async replacePalletsAndRecordGeneratedLabels(
    container: ContainerRecord,
    drafts: PalletDraft[],
    outputPath: string,
    printedAt: Date,
  ): Promise<PersistedLabels> {
    return await this.prisma.$transaction(async (tx) => {
      const destinationIds = (container.destinations ?? []).map(
        (destination) => destination.id,
      );
      await tx.pallet.deleteMany({
        where: { containerDestinationId: { in: destinationIds } },
      });

      const created: PalletRecord[] = [];
      for (const draft of drafts) {
        const pallet = (await tx.pallet.create({
          data: {
            containerDestinationId: draft.containerDestinationId,
            palletNo: draft.palletNo,
            palletId: draft.palletId,
            qrPayload: draft.qrPayload,
            status: PalletStatus.PLANNED,
            labelPrintedAt: null,
          },
        })) as PalletRecord;
        created.push(pallet);
      }

      await tx.palletEvent.createMany({
        data: created.map((pallet) => ({
          palletId: pallet.id,
          eventType: PalletEventType.CREATED,
          fromStatus: null,
          toStatus: PalletStatus.PLANNED,
          scanPayload: pallet.qrPayload,
          metadata: { source: 'generate-labels-api' },
        })),
      });

      const fileBuffer = await readFile(outputPath);
      const fileStat = await stat(outputPath);
      const fileSha256 = createHash('sha256').update(fileBuffer).digest('hex');
      const generatedFile = await this.upsertGeneratedFile(tx, container, {
        fileType: GeneratedFileType.PALLET_LABEL_PDF,
        storagePath: outputPath,
        fileSha256,
        mimeType: PDF_MIME_TYPE,
        fileSizeBytes: BigInt(fileStat.size),
        status: GeneratedFileStatus.GENERATED,
        errorMessage: null,
      });
      const palletIds = created.map((pallet) => pallet.id);

      await tx.pallet.updateMany({
        where: { id: { in: palletIds } },
        data: {
          status: PalletStatus.LABEL_PRINTED,
          labelPrintedAt: printedAt,
        },
      });
      await tx.palletEvent.createMany({
        data: created.map((pallet) => ({
          palletId: pallet.id,
          eventType: PalletEventType.LABEL_PRINTED,
          fromStatus: PalletStatus.PLANNED,
          toStatus: PalletStatus.LABEL_PRINTED,
          scanPayload: pallet.qrPayload,
          metadata: {
            source: 'generate-labels-api',
            generatedFileId: generatedFile.id,
            storagePath: outputPath,
          },
        })),
      });
      await tx.container.update({
        where: { id: container.id },
        data: { status: ContainerStatus.LABELS_GENERATED },
      });

      return { generatedFile, pallets: created };
    });
  }

  private toWorkerLabelRequest(
    container: ContainerRecord,
    drafts: PalletDraft[],
  ): WorkerLabelRequest {
    const destinations = container.destinations ?? [];
    return {
      parsed_result: {
        containerNo: container.containerNo,
        formatType: container.sourceFormat,
        parserVersion: container.parserVersion,
        destinationSummaries: destinations.map((destination) => ({
          destinationCode: destination.destinationCode,
          totalCartons: destination.cartons,
          totalVolumeCbm: this.numberValue(destination.volume),
          lineCount: 0,
        })),
        lines: [],
        warnings: [],
        errors: [],
        rawMetadata: {
          source: 'api-database',
          containerId: container.id,
        },
      },
      pallet_result: {
        plans: destinations.map((destination) => {
          const destinationDrafts = drafts.filter(
            (draft) => draft.containerDestinationId === destination.id,
          );
          return {
            destinationCode: destination.destinationCode,
            destinationType: destination.destinationType ?? 'UNKNOWN',
            totalCartons: destination.cartons,
            totalVolumeCbm: this.numberValue(destination.volume),
            lineCount: 0,
            calculatedPallets: destination.calculatedPallets,
            manualPallets: destination.manualPallets,
            finalPallets: destination.finalPallets,
            palletIds: destinationDrafts.map((draft) => draft.palletId),
            warnings: [],
          };
        }),
        warnings: [],
        errors: [],
        totalCalculatedPallets: destinations.reduce(
          (total, destination) => total + destination.calculatedPallets,
          0,
        ),
        totalFinalPallets: drafts.length,
      },
    };
  }

  private async recordFailedGeneratedFile(
    container: ContainerRecord,
    storagePath: string,
    error: unknown,
  ): Promise<GeneratedFileRecord> {
    return await this.upsertGeneratedFile(this.prisma, container, {
      fileType: GeneratedFileType.PALLET_LABEL_PDF,
      storagePath,
      fileSha256: null,
      mimeType: PDF_MIME_TYPE,
      fileSizeBytes: null,
      status: GeneratedFileStatus.FAILED,
      errorMessage: this.errorMessage(error),
    });
  }

  private async upsertGeneratedFile(
    tx: any,
    container: ContainerRecord,
    data: {
      fileType: string;
      storagePath: string;
      fileSha256: string | null;
      mimeType: string;
      fileSizeBytes: bigint | null;
      status: string;
      errorMessage: string | null;
    },
  ): Promise<GeneratedFileRecord> {
    const existing = (await tx.generatedFile.findFirst({
      where: { containerId: container.id, fileType: data.fileType },
      orderBy: { updatedAt: 'desc' },
    })) as GeneratedFileRecord | null;
    const recordData = {
      importFileId: container.importFileId,
      containerId: container.id,
      ...data,
    };

    if (existing) {
      return (await tx.generatedFile.update({
        where: { id: existing.id },
        data: recordData,
      })) as GeneratedFileRecord;
    }

    return (await tx.generatedFile.create({
      data: recordData,
    })) as GeneratedFileRecord;
  }

  private labelFailure(
    error: unknown,
    generatedFile: GeneratedFileRecord,
  ): InternalServerErrorException {
    return new InternalServerErrorException({
      code: 'LABEL_GENERATION_FAILED',
      message: 'The pallet label PDF could not be generated.',
      details: {
        generatedFile: this.toGeneratedFileResponse(generatedFile),
        errorMessage: this.errorMessage(error),
      },
    });
  }

  private outputPathFromPayload(payload: WorkerLabelPayload): string | null {
    const outputPath = payload.label_result?.outputPath;
    return typeof outputPath === 'string' && outputPath.trim()
      ? outputPath
      : null;
  }

  private workerQrPayloadsMatch(
    payload: WorkerLabelPayload,
    drafts: PalletDraft[],
  ): boolean {
    const workerQrPayloads = payload.label_result?.qrPayloads;
    if (!Array.isArray(workerQrPayloads)) {
      return false;
    }

    const expected = drafts.map((draft) => draft.qrPayload);
    return (
      workerQrPayloads.length === expected.length &&
      workerQrPayloads.every((value, index) => value === expected[index])
    );
  }

  private failureStoragePath(container: ContainerRecord): string {
    return join(
      this.storageRoot,
      'labels',
      `${this.safeFilename(container.containerNo)}托盘面单.pdf`,
    );
  }

  private toGeneratedFileResponse(
    record: GeneratedFileRecord,
  ): GeneratedFileResponseDto {
    return {
      id: record.id,
      importFileId: record.importFileId,
      containerId: record.containerId,
      fileType: record.fileType,
      storagePath: record.storagePath,
      fileSha256: record.fileSha256,
      mimeType: record.mimeType,
      fileSizeBytes:
        record.fileSizeBytes === null ? null : record.fileSizeBytes.toString(),
      status: record.status,
      errorMessage: record.errorMessage,
      createdAt: this.toIsoString(record.createdAt),
      updatedAt: this.toIsoString(record.updatedAt),
    };
  }

  private toPalletResponse(
    pallet: PalletRecord,
    draft?: PalletDraft,
    override?: { status: string; labelPrintedAt: Date },
  ): PalletResponseDto {
    const destination = pallet.containerDestination;
    return {
      id: pallet.id,
      containerId: destination?.containerId ?? draft?.containerId ?? '',
      containerDestinationId: pallet.containerDestinationId,
      destinationCode:
        destination?.destinationCode ?? draft?.destinationCode ?? '',
      destinationType:
        destination?.destinationType ?? draft?.destinationType ?? null,
      palletNo: pallet.palletNo,
      palletId: pallet.palletId,
      qrPayload: pallet.qrPayload,
      status: override?.status ?? pallet.status,
      labelPrintedAt: override
        ? override.labelPrintedAt.toISOString()
        : this.toIsoStringOrNull(pallet.labelPrintedAt),
      createdAt: this.toIsoString(pallet.createdAt),
      updatedAt: this.toIsoString(pallet.updatedAt),
    };
  }

  private toReprintAuditEventResponse(input: {
    event: PalletEventRecord;
    pallet: PalletRecord;
    reason: string;
    supervisorOverride: boolean;
  }): ReprintAuditEventDto {
    return {
      id: input.event.id,
      palletRecordId: input.pallet.id,
      businessPalletId: input.pallet.palletId,
      userId: input.event.operatorId ?? '',
      printedAt: this.toIsoString(input.event.occurredAt),
      reason: input.reason,
      palletStatus: input.pallet.status,
      supervisorOverride: input.supervisorOverride,
    };
  }

  private buildPalletId(
    container: ContainerRecord,
    destination: ContainerDestinationRecord,
    destinationIndex: number,
    palletNo: number,
  ): string {
    return [
      this.slug(container.containerNo),
      `D${destinationIndex.toString().padStart(3, '0')}`,
      this.slug(destination.destinationCode || MANUAL_DESTINATION),
      `P${palletNo.toString().padStart(3, '0')}`,
      this.slug(container.id).slice(-16),
    ].join('-');
  }

  private buildQrPayload(input: {
    labelDate: string;
    containerNo: string;
    destination: string;
    palletNo: string;
    palletId: string;
  }): string {
    return [
      'SSP1',
      'PALLET',
      input.labelDate,
      this.payloadPart(input.containerNo),
      this.payloadPart(input.destination),
      this.payloadPart(input.palletNo),
      this.payloadPart(input.palletId),
    ].join('|');
  }

  private payloadPart(value: string): string {
    return value.replace(/\|/g, '/').trim();
  }

  private labelDate(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private issueArray(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
  }

  private numberValue(value: { toString(): string } | number | string): number {
    const parsed = Number(value.toString());
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private safeFilename(value: string): string {
    return (
      value.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') ||
      'UNKNOWN-CONTAINER'
    );
  }

  private slug(value: string): string {
    return (
      value
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'UNKNOWN'
    );
  }

  private toIsoString(value: Date | string): string {
    return value instanceof Date ? value.toISOString() : value;
  }

  private toIsoStringOrNull(value: Date | string | null): string | null {
    if (value === null) {
      return null;
    }
    return this.toIsoString(value);
  }

  private errorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    if (
      error !== null &&
      typeof error === 'object' &&
      'errors' in error &&
      Array.isArray(error.errors) &&
      error.errors.length > 0
    ) {
      const first = error.errors[0] as { message?: unknown };
      if (typeof first.message === 'string') {
        return first.message;
      }
    }
    return 'Unknown label generation error';
  }
}
