import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CloseLoadJobDto } from './dto/close-load-job.dto';
import {
  CreateLoadJobDto,
  CreateLoadJobLineDto,
} from './dto/create-load-job.dto';
import { ListLoadJobsQueryDto } from './dto/list-load-jobs-query.dto';
import {
  LoadJobLoadedPalletsResponseDto,
  LoadJobListResponseDto,
  LoadJobLineResponseDto,
  LoadJobProgressDto,
  LoadJobResponseDto,
  LoadJobScanResponseDto,
  ScannedPalletResponseDto,
} from './dto/load-job-response.dto';
import { ReverseScanDto } from './dto/reverse-scan.dto';
import { ScanPalletDto } from './dto/scan-pallet.dto';
import {
  LoadJobStatus,
  PalletEventType,
  PalletStatus,
} from '../generated/prisma/enums';
import { containerStatusFromInventoryCounts } from '../common/container-lifecycle';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type LoadJobStatusValue = (typeof LoadJobStatus)[keyof typeof LoadJobStatus];
type PalletStatusValue = (typeof PalletStatus)[keyof typeof PalletStatus];

interface UserRecord {
  id: string;
  email: string | null;
  name: string | null;
  role: string;
}

interface ContainerRecord {
  id: string;
  containerNo: string;
}

interface LoadJobRecord {
  id: string;
  containerId: string | null;
  container?: ContainerRecord | null;
  jobNo: string | null;
  truckNo: string | null;
  carrier: string | null;
  destinationRegion: string | null;
  status: LoadJobStatusValue;
  startedAt: Date | string | null;
  scheduledDepartureAt: Date | string | null;
  closedAt: Date | string | null;
  createdById: string | null;
  createdBy?: UserRecord | null;
  lines?: LoadJobLineRecord[];
  createdAt: Date | string;
  updatedAt: Date | string;
  _count?: {
    pallets?: number;
    events?: number;
  };
}

interface LoadJobLineRecord {
  id: string;
  loadJobId: string;
  sequence: number;
  sourceText: string | null;
  containerNo: string | null;
  containerId: string | null;
  container?: ContainerRecord | null;
  containerDestinationId: string | null;
  destinationCode: string | null;
  plannedPallets: number;
  externalTransfer: boolean;
  note: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

interface ContainerDestinationRecord {
  id: string;
  containerId: string;
  container?: ContainerRecord | null;
  destinationCode: string;
  destinationType: string | null;
}

interface PalletRecord {
  id: string;
  containerDestinationId: string;
  containerDestination?: ContainerDestinationRecord | null;
  palletNo: number;
  palletId: string;
  qrPayload: string;
  status: PalletStatusValue;
  labelPrintedAt: Date | string | null;
  loadedAt: Date | string | null;
  loadJobId: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

interface PalletEventRecord {
  id: string;
}

interface ContainerLookupClient {
  container: {
    findUnique(args: unknown): Promise<unknown>;
  };
  containerDestination: {
    findFirst(args: unknown): Promise<unknown>;
    findUnique(args: unknown): Promise<unknown>;
  };
}

interface UserLookupClient {
  user: {
    findUnique(args: unknown): Promise<unknown>;
  };
}

interface PalletLockClient {
  $queryRaw(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<unknown>;
}

interface PalletCountClient {
  pallet: {
    count(args: unknown): Promise<number>;
  };
}

interface ContainerStatusSyncClient extends PalletCountClient {
  container: {
    update(args: unknown): Promise<unknown>;
  };
}

interface PalletEventCreateClient {
  palletEvent: {
    create(args: unknown): Promise<unknown>;
  };
}

interface LoadJobReadClient {
  loadJob: {
    findUnique(args: unknown): Promise<unknown>;
  };
}

type ScanProgressClient = LoadJobReadClient & PalletCountClient;

type ScanTransactionClient = ScanProgressClient &
  PalletEventCreateClient & {
    container: {
      update(args: unknown): Promise<unknown>;
    };
    pallet: {
      count(args: unknown): Promise<number>;
      update(args: unknown): Promise<unknown>;
    };
  };

interface ParsedPalletQrPayload {
  payload: string;
  version: string;
  payloadType: string;
  palletId: string;
  parts: string[];
}

type ScanMetadata = Record<string, string | number>;

interface NormalizedLoadJobLine {
  sequence: number;
  sourceText: string | null;
  containerNo: string | null;
  containerId: string | null;
  containerDestinationId: string | null;
  destinationCode: string | null;
  plannedPallets: number;
  externalTransfer: boolean;
  note: string | null;
}

type ScanTransactionOutcome =
  | {
      kind: 'response';
      response: LoadJobScanResponseDto;
    }
  | {
      kind: 'error';
      exception: HttpException;
    };

const LOAD_JOB_INCLUDE = {
  container: {
    select: {
      id: true,
      containerNo: true,
    },
  },
  lines: {
    orderBy: { sequence: 'asc' },
    include: {
      container: {
        select: {
          id: true,
          containerNo: true,
        },
      },
    },
  },
  createdBy: {
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
    },
  },
  _count: {
    select: {
      pallets: true,
      events: true,
    },
  },
} satisfies Prisma.LoadJobInclude;

const PALLET_INCLUDE = {
  containerDestination: {
    select: {
      id: true,
      containerId: true,
      container: {
        select: {
          id: true,
          containerNo: true,
        },
      },
      destinationCode: true,
      destinationType: true,
    },
  },
} satisfies Prisma.PalletInclude;

@Injectable()
export class LoadJobsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateLoadJobDto): Promise<LoadJobResponseDto> {
    const requestedContainerId = this.stringOrNull(dto.containerId);
    const lines = await this.normalizeLoadJobLines(this.prisma, dto);
    if (requestedContainerId) {
      await this.assertContainerExists(this.prisma, requestedContainerId);
    }
    if (dto.createdById) {
      await this.assertUserExists(
        this.prisma,
        dto.createdById,
        'LOAD_JOB_CREATED_BY_NOT_FOUND',
      );
    }

    const loadNo = this.requiredString(dto.loadNo, 'loadNo');
    const startedAt = dto.startedAt ? new Date(dto.startedAt) : new Date();
    const scheduledDepartureAt = dto.scheduledDepartureAt
      ? new Date(dto.scheduledDepartureAt)
      : null;
    const primaryContainerId =
      requestedContainerId ??
      lines.find((line) => !line.externalTransfer)?.containerId ??
      null;

    try {
      const record = (await this.prisma.loadJob.create({
        data: {
          containerId: primaryContainerId,
          jobNo: loadNo,
          truckNo: this.stringOrNull(dto.truckNo),
          carrier: this.stringOrNull(dto.carrier),
          destinationRegion: this.stringOrNull(dto.destinationRegion),
          status: LoadJobStatus.IN_PROGRESS,
          startedAt,
          scheduledDepartureAt,
          closedAt: null,
          createdById: this.stringOrNull(dto.createdById),
          lines: {
            create: lines,
          },
        },
        include: LOAD_JOB_INCLUDE,
      })) as LoadJobRecord;

      return this.toResponse(record);
    } catch (error) {
      this.throwConflictIfUnique(error, 'LOAD_JOB_CREATE_CONFLICT');
      throw error;
    }
  }

  async list(query: ListLoadJobsQueryDto): Promise<LoadJobListResponseDto> {
    const where: Prisma.LoadJobWhereInput = {};
    if (query.containerId) {
      where.OR = [
        { containerId: query.containerId },
        { lines: { some: { containerId: query.containerId } } },
      ];
    }
    if (query.loadNo) {
      where.jobNo = query.loadNo;
    }
    if (query.destinationRegion) {
      where.destinationRegion = query.destinationRegion;
    }
    if (query.status) {
      where.status = this.status(query.status);
    }

    const records = (await this.prisma.loadJob.findMany({
      where,
      include: LOAD_JOB_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: query.limit,
      skip: query.offset,
    })) as LoadJobRecord[];

    return {
      items: records.map((record) => this.toResponse(record)),
      limit: query.limit,
      offset: query.offset,
    };
  }

  async getById(id: string): Promise<LoadJobResponseDto> {
    const record = (await this.prisma.loadJob.findUnique({
      where: { id },
      include: LOAD_JOB_INCLUDE,
    })) as LoadJobRecord | null;

    if (!record) {
      throw new NotFoundException({
        code: 'LOAD_JOB_NOT_FOUND',
        message: `Load job ${id} was not found.`,
        details: { id },
      });
    }

    return this.toResponse(record);
  }

  async listLoadedPallets(
    id: string,
  ): Promise<LoadJobLoadedPalletsResponseDto> {
    await this.findLoadJobOrThrow(this.prisma, id);

    const pallets = (await this.prisma.pallet.findMany({
      where: {
        loadJobId: id,
        status: PalletStatus.LOADED,
      },
      include: PALLET_INCLUDE,
      orderBy: [{ loadedAt: 'desc' }, { palletNo: 'asc' }],
    })) as PalletRecord[];

    return {
      items: pallets.map((pallet) => this.toScannedPalletResponse(pallet)),
    };
  }

  async close(id: string, dto: CloseLoadJobDto): Promise<LoadJobResponseDto> {
    const closedAt = new Date();

    const record = await this.prisma.$transaction(async (tx) => {
      const existing = (await tx.loadJob.findUnique({
        where: { id },
        include: LOAD_JOB_INCLUDE,
      })) as LoadJobRecord | null;

      if (!existing) {
        throw new NotFoundException({
          code: 'LOAD_JOB_NOT_FOUND',
          message: `Load job ${id} was not found.`,
          details: { id },
        });
      }

      this.assertClosable(existing);
      if (dto.operatorId) {
        await this.assertUserExists(
          tx,
          dto.operatorId,
          'LOAD_JOB_CLOSE_OPERATOR_NOT_FOUND',
        );
      }

      await tx.palletEvent.create({
        data: {
          loadJobId: id,
          eventType: PalletEventType.STATUS_CHANGED,
          metadata: this.closeEventMetadata(existing, dto),
          operatorId: this.stringOrNull(dto.operatorId),
          occurredAt: closedAt,
        },
      });

      const updated = (await tx.loadJob.update({
        where: { id },
        data: {
          status: LoadJobStatus.COMPLETED,
          closedAt,
        },
        include: LOAD_JOB_INCLUDE,
      })) as LoadJobRecord;

      return updated;
    });

    return this.toResponse(record);
  }

  async scan(id: string, dto: ScanPalletDto): Promise<LoadJobScanResponseDto> {
    const outcome = await this.prisma.$transaction(async (tx) => {
      const loadJob = await this.findLoadJobOrThrow(tx, id);
      const scanPayload = this.stringOrNull(dto.qrPayload);
      const deviceId = this.stringOrNull(dto.deviceId);
      const operatorId = this.stringOrNull(dto.operatorId);

      if (operatorId) {
        await this.assertUserExists(
          tx,
          operatorId,
          'LOAD_JOB_SCAN_OPERATOR_NOT_FOUND',
        );
      }

      if (!this.canScan(loadJob.status)) {
        await this.createInvalidScanEvent(tx, {
          loadJobId: id,
          scanPayload,
          deviceId,
          operatorId,
          exceptionReason: 'LOAD_JOB_NOT_OPEN',
          metadata: {
            loadJobStatus: loadJob.status,
          },
        });
        return this.scanError(
          new ConflictException({
            code: 'LOAD_JOB_NOT_OPEN',
            message: `Load job ${id} is not open for scanning.`,
            details: { id, status: loadJob.status },
          }),
        );
      }

      const parsed = this.parsePalletQrPayload(scanPayload);
      if (!parsed) {
        await this.createInvalidScanEvent(tx, {
          loadJobId: id,
          scanPayload,
          deviceId,
          operatorId,
          exceptionReason: 'INVALID_QR_PAYLOAD',
          metadata: {
            expectedFormat: 'SSP1|PALLET|...|PALLET_ID',
          },
        });
        return this.scanError(
          new BadRequestException({
            code: 'INVALID_QR_PAYLOAD',
            message: 'QR payload must use SSP1|PALLET|...|PALLET_ID.',
            details: { qrPayload: scanPayload },
          }),
        );
      }

      const candidate = await this.findPalletByScanPayload(tx, parsed);
      if (!candidate) {
        await this.createInvalidScanEvent(tx, {
          loadJobId: id,
          scanPayload: parsed.payload,
          deviceId,
          operatorId,
          exceptionReason: 'PALLET_NOT_FOUND',
          metadata: this.scanMetadata(parsed),
        });
        return this.scanError(
          new NotFoundException({
            code: 'PALLET_NOT_FOUND',
            message: `Pallet ${parsed.palletId} was not found.`,
            details: { palletId: parsed.palletId },
          }),
        );
      }

      await this.lockPalletRow(tx, candidate.id);
      const pallet = await this.findPalletById(tx, candidate.id);
      if (!pallet) {
        await this.createInvalidScanEvent(tx, {
          loadJobId: id,
          scanPayload: parsed.payload,
          deviceId,
          operatorId,
          exceptionReason: 'PALLET_NOT_FOUND_AFTER_LOCK',
          metadata: this.scanMetadata(parsed),
        });
        return this.scanError(
          new NotFoundException({
            code: 'PALLET_NOT_FOUND',
            message: `Pallet ${parsed.palletId} was not found.`,
            details: { palletId: parsed.palletId },
          }),
        );
      }

      if (pallet.status === PalletStatus.CANCELLED) {
        await this.createInvalidScanEvent(tx, {
          loadJobId: id,
          palletId: pallet.id,
          fromStatus: pallet.status,
          toStatus: pallet.status,
          scanPayload: parsed.payload,
          deviceId,
          operatorId,
          exceptionReason: 'PALLET_CANCELLED',
          metadata: this.scanMetadata(parsed),
        });
        return this.scanError(
          new ConflictException({
            code: 'PALLET_CANCELLED',
            message: `Pallet ${pallet.palletId} is cancelled and cannot be loaded.`,
            details: { palletId: pallet.palletId, status: pallet.status },
          }),
        );
      }

      if (pallet.status === PalletStatus.LOADED) {
        if (pallet.loadJobId === id) {
          return await this.recordDuplicateScan(tx, {
            loadJob,
            pallet,
            parsed,
            deviceId,
            operatorId,
          });
        }

        await this.createInvalidScanEvent(tx, {
          loadJobId: id,
          palletId: pallet.id,
          fromStatus: pallet.status,
          toStatus: pallet.status,
          scanPayload: parsed.payload,
          deviceId,
          operatorId,
          exceptionReason: 'PALLET_ALREADY_LOADED_IN_DIFFERENT_LOAD_JOB',
          metadata: {
            ...this.scanMetadata(parsed),
            existingLoadJobId: pallet.loadJobId,
          },
        });
        return this.scanError(
          new ConflictException({
            code: 'PALLET_ALREADY_LOADED',
            message: `Pallet ${pallet.palletId} is already loaded by another load job.`,
            details: {
              palletId: pallet.palletId,
              existingLoadJobId: pallet.loadJobId,
              requestedLoadJobId: id,
            },
          }),
        );
      }

      const planLine = this.matchLoadJobLine(loadJob, pallet);
      if (!planLine) {
        await this.createInvalidScanEvent(tx, {
          loadJobId: id,
          palletId: pallet.id,
          fromStatus: pallet.status,
          toStatus: pallet.status,
          scanPayload: parsed.payload,
          deviceId,
          operatorId,
          exceptionReason: 'PALLET_NOT_IN_LOAD_PLAN',
          metadata: {
            ...this.scanMetadata(parsed),
            palletContainerId: pallet.containerDestination?.containerId ?? '',
            palletDestinationCode:
              pallet.containerDestination?.destinationCode ?? '',
          },
        });
        return this.scanError(
          new ConflictException({
            code: 'PALLET_NOT_IN_LOAD_PLAN',
            message: `Pallet ${pallet.palletId} is not included in load job ${id}.`,
            details: {
              palletId: pallet.palletId,
              loadJobId: id,
              palletContainerId: pallet.containerDestination?.containerId,
              palletDestinationCode:
                pallet.containerDestination?.destinationCode ?? null,
            },
          }),
        );
      }

      const loadedForLine = await this.loadedPalletCountForLine(
        tx,
        id,
        planLine,
      );
      if (loadedForLine >= planLine.plannedPallets) {
        await this.createInvalidScanEvent(tx, {
          loadJobId: id,
          palletId: pallet.id,
          fromStatus: pallet.status,
          toStatus: pallet.status,
          scanPayload: parsed.payload,
          deviceId,
          operatorId,
          exceptionReason: 'LOAD_JOB_LINE_PALLET_LIMIT_REACHED',
          metadata: {
            ...this.scanMetadata(parsed),
            loadJobLineId: planLine.id,
            plannedPallets: planLine.plannedPallets,
            loadedForLine,
          },
        });
        return this.scanError(
          new ConflictException({
            code: 'LOAD_JOB_LINE_PALLET_LIMIT_REACHED',
            message: `Load job line ${planLine.id} has already loaded its planned pallet count.`,
            details: {
              loadJobId: id,
              loadJobLineId: planLine.id,
              plannedPallets: planLine.plannedPallets,
              loadedForLine,
            },
          }),
        );
      }

      return await this.recordLoadedScan(tx, {
        loadJob,
        planLine,
        pallet,
        parsed,
        deviceId,
        operatorId,
      });
    });

    if (outcome.kind === 'error') {
      throw outcome.exception;
    }

    return outcome.response;
  }

  async reverseScan(
    id: string,
    dto: ReverseScanDto,
  ): Promise<LoadJobScanResponseDto> {
    if (dto.confirm !== true) {
      throw new BadRequestException({
        code: 'LOAD_JOB_REVERSE_SCAN_CONFIRMATION_REQUIRED',
        message: 'Reverse scan requires explicit confirmation.',
        details: { loadJobId: id },
      });
    }

    const outcome = await this.prisma.$transaction(async (tx) => {
      const loadJob = await this.findLoadJobOrThrow(tx, id);
      const deviceId = this.stringOrNull(dto.deviceId);
      const operatorId = this.stringOrNull(dto.operatorId);
      const reason = this.requiredString(dto.reason, 'reason');

      if (operatorId) {
        await this.assertUserExists(
          tx,
          operatorId,
          'LOAD_JOB_REVERSE_SCAN_OPERATOR_NOT_FOUND',
        );
      }

      if (!this.canScan(loadJob.status)) {
        return this.scanError(
          new ConflictException({
            code: 'LOAD_JOB_NOT_OPEN',
            message: `Load job ${id} is not open for scan correction.`,
            details: { id, status: loadJob.status },
          }),
        );
      }

      await this.lockPalletRow(tx, dto.palletRecordId);
      const pallet = await this.findPalletById(tx, dto.palletRecordId);
      if (!pallet) {
        return this.scanError(
          new NotFoundException({
            code: 'PALLET_NOT_FOUND',
            message: `Pallet ${dto.palletRecordId} was not found.`,
            details: { palletRecordId: dto.palletRecordId },
          }),
        );
      }

      if (pallet.status !== PalletStatus.LOADED || pallet.loadJobId !== id) {
        return this.scanError(
          new ConflictException({
            code: 'PALLET_NOT_LOADED_IN_LOAD_JOB',
            message:
              'Only pallets loaded in the current load job can be removed from progress.',
            details: {
              loadJobId: id,
              palletRecordId: pallet.id,
              palletId: pallet.palletId,
              palletStatus: pallet.status,
              palletLoadJobId: pallet.loadJobId,
            },
          }),
        );
      }

      return await this.recordReversedScan(tx, {
        deviceId,
        loadJob,
        operatorId,
        pallet,
        reason,
      });
    });

    if (outcome.kind === 'error') {
      throw outcome.exception;
    }

    return outcome.response;
  }

  private async assertContainerExists(
    client: ContainerLookupClient,
    containerId: string,
  ): Promise<void> {
    const record = await client.container.findUnique({
      where: { id: containerId },
      select: { id: true },
    });

    if (!record) {
      throw new NotFoundException({
        code: 'LOAD_JOB_CONTAINER_NOT_FOUND',
        message: `Container ${containerId} was not found.`,
        details: { containerId },
      });
    }
  }

  private async assertUserExists(
    client: UserLookupClient,
    userId: string,
    code: string,
  ): Promise<void> {
    const record = await client.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });

    if (!record) {
      throw new NotFoundException({
        code,
        message: `User ${userId} was not found.`,
        details: { userId },
      });
    }
  }

  private async normalizeLoadJobLines(
    client: ContainerLookupClient,
    dto: CreateLoadJobDto,
  ): Promise<NormalizedLoadJobLine[]> {
    const rawLines = dto.lines ?? [];
    const normalized: NormalizedLoadJobLine[] = [];

    if (rawLines.length === 0) {
      throw new BadRequestException({
        code: 'LOAD_JOB_LINES_REQUIRED',
        message: 'At least one load job line is required.',
        details: { loadNo: this.stringOrNull(dto.loadNo) },
      });
    }

    for (let index = 0; index < rawLines.length; index += 1) {
      normalized.push(
        await this.normalizeLoadJobLine(client, dto, rawLines[index], index),
      );
    }

    this.assertUniqueSystemLineKeys(normalized);
    return normalized;
  }

  private async normalizeLoadJobLine(
    client: ContainerLookupClient,
    dto: CreateLoadJobDto,
    line: CreateLoadJobLineDto,
    index: number,
  ): Promise<NormalizedLoadJobLine> {
    const sourceText = this.stringOrNull(line.sourceText);
    const parsed = this.parseLoadJobLineText(sourceText);
    const rawContainerNo =
      this.stringOrNull(line.containerNo) ?? parsed.containerNo;
    const externalTransfer =
      line.externalTransfer === true ||
      this.hasTransferSuffix(sourceText) ||
      this.hasTransferSuffix(rawContainerNo);
    const plannedPallets = line.plannedPallets ?? parsed.plannedPallets;
    const destinationCode =
      this.stringOrNull(line.destinationCode) ??
      this.stringOrNull(dto.destinationRegion);

    if (plannedPallets === null) {
      throw new BadRequestException({
        code: 'LOAD_JOB_LINE_PALLETS_REQUIRED',
        message:
          'Each load job line must provide plannedPallets or a sourceText ending with a pallet count such as -5P or -5P-part1.',
        details: { sequence: index + 1, sourceText },
      });
    }

    if (externalTransfer) {
      return {
        sequence: index + 1,
        sourceText,
        containerNo: rawContainerNo,
        containerId: null,
        containerDestinationId: null,
        destinationCode,
        plannedPallets,
        externalTransfer: true,
        note: this.stringOrNull(line.note),
      };
    }

    if (plannedPallets <= 0) {
      throw new BadRequestException({
        code: 'LOAD_JOB_LINE_PALLETS_REQUIRED',
        message: 'System load job lines must plan at least one pallet.',
        details: { sequence: index + 1, plannedPallets },
      });
    }

    const container = await this.resolveLineContainer(client, {
      containerId: this.stringOrNull(line.containerId),
      containerNo: rawContainerNo,
      sequence: index + 1,
    });
    const containerDestinationId = await this.resolveLineDestinationId(client, {
      containerId: container.id,
      containerDestinationId: this.stringOrNull(line.containerDestinationId),
      destinationCode,
      sequence: index + 1,
    });

    return {
      sequence: index + 1,
      sourceText,
      containerNo: container.containerNo,
      containerId: container.id,
      containerDestinationId,
      destinationCode,
      plannedPallets,
      externalTransfer: false,
      note: this.stringOrNull(line.note),
    };
  }

  private parseLoadJobLineText(sourceText: string | null): {
    containerNo: string | null;
    plannedPallets: number | null;
  } {
    if (!sourceText) {
      return { containerNo: null, plannedPallets: null };
    }

    const palletMatch = sourceText.match(
      /^(?<prefix>.*?)\s*[-–—]?\s*(?<plannedPallets>\d+)\s*P(?:\s*[-_ ]?\s*part\s*\d+)?\s*$/i,
    );
    const plannedPallets = palletMatch?.groups?.plannedPallets
      ? Number(palletMatch.groups.plannedPallets)
      : null;
    const containerSource = palletMatch?.groups?.prefix ?? sourceText;
    const containerNo = containerSource
      .replace(/转运/g, '')
      .replace(/[-–—\s]+$/g, '')
      .trim();

    return {
      containerNo: containerNo || null,
      plannedPallets,
    };
  }

  private hasTransferSuffix(value: string | null): boolean {
    return Boolean(value?.includes('转运'));
  }

  private async resolveLineContainer(
    client: ContainerLookupClient,
    input: {
      containerId: string | null;
      containerNo: string | null;
      sequence: number;
    },
  ): Promise<ContainerRecord> {
    if (!input.containerId && !input.containerNo) {
      throw new BadRequestException({
        code: 'LOAD_JOB_LINE_CONTAINER_REQUIRED',
        message: `Load job line ${input.sequence} must provide containerId, containerNo, or a sourceText container number.`,
        details: { sequence: input.sequence },
      });
    }

    const record = (await client.container.findUnique({
      where: input.containerId
        ? { id: input.containerId }
        : { containerNo: input.containerNo ?? '' },
      select: { id: true, containerNo: true },
    })) as ContainerRecord | null;

    if (!record) {
      throw new NotFoundException({
        code: 'LOAD_JOB_LINE_CONTAINER_NOT_FOUND',
        message: `Load job line ${input.sequence} references a container that was not found.`,
        details: {
          sequence: input.sequence,
          containerId: input.containerId,
          containerNo: input.containerNo,
        },
      });
    }

    return record;
  }

  private async resolveLineDestinationId(
    client: ContainerLookupClient,
    input: {
      containerId: string;
      containerDestinationId: string | null;
      destinationCode: string | null;
      sequence: number;
    },
  ): Promise<string | null> {
    if (input.containerDestinationId) {
      const destination = (await client.containerDestination.findUnique({
        where: { id: input.containerDestinationId },
        select: { id: true, containerId: true },
      })) as { id: string; containerId: string } | null;

      if (!destination || destination.containerId !== input.containerId) {
        throw new NotFoundException({
          code: 'LOAD_JOB_LINE_DESTINATION_NOT_FOUND',
          message: `Load job line ${input.sequence} references a destination that was not found for the container.`,
          details: {
            sequence: input.sequence,
            containerId: input.containerId,
            containerDestinationId: input.containerDestinationId,
          },
        });
      }

      return destination.id;
    }

    if (!input.destinationCode) {
      return null;
    }

    const destination = (await client.containerDestination.findFirst({
      where: {
        containerId: input.containerId,
        destinationCode: input.destinationCode,
      },
      select: { id: true },
    })) as { id: string } | null;

    if (!destination) {
      throw new NotFoundException({
        code: 'LOAD_JOB_LINE_DESTINATION_NOT_FOUND',
        message: `Load job line ${input.sequence} references destination ${input.destinationCode}, but that destination was not found for the container.`,
        details: {
          sequence: input.sequence,
          containerId: input.containerId,
          destinationCode: input.destinationCode,
        },
      });
    }

    return destination.id;
  }

  private assertUniqueSystemLineKeys(lines: NormalizedLoadJobLine[]): void {
    const seen = new Map<string, number>();

    for (const line of lines) {
      if (line.externalTransfer) {
        continue;
      }

      const key = line.containerDestinationId
        ? `destination:${line.containerDestinationId}`
        : `container:${line.containerId ?? ''}:destination:${line.destinationCode ?? ''}`;
      const existingSequence = seen.get(key);

      if (existingSequence) {
        throw new BadRequestException({
          code: 'LOAD_JOB_LINE_DUPLICATE_SYSTEM_SCOPE',
          message:
            'System load job lines must not repeat the same container and destination scope.',
          details: {
            firstSequence: existingSequence,
            duplicateSequence: line.sequence,
          },
        });
      }

      seen.set(key, line.sequence);
    }
  }

  private async findLoadJobOrThrow(
    client: { loadJob: { findUnique(args: unknown): Promise<unknown> } },
    id: string,
  ): Promise<LoadJobRecord> {
    const record = (await client.loadJob.findUnique({
      where: { id },
      include: LOAD_JOB_INCLUDE,
    })) as LoadJobRecord | null;

    if (!record) {
      throw new NotFoundException({
        code: 'LOAD_JOB_NOT_FOUND',
        message: `Load job ${id} was not found.`,
        details: { id },
      });
    }

    return record;
  }

  private async findPalletByScanPayload(
    client: { pallet: { findFirst(args: unknown): Promise<unknown> } },
    parsed: ParsedPalletQrPayload,
  ): Promise<PalletRecord | null> {
    return (await client.pallet.findFirst({
      where: {
        OR: [{ qrPayload: parsed.payload }, { palletId: parsed.palletId }],
      },
      include: PALLET_INCLUDE,
    })) as PalletRecord | null;
  }

  private async findPalletById(
    client: { pallet: { findUnique(args: unknown): Promise<unknown> } },
    id: string,
  ): Promise<PalletRecord | null> {
    return (await client.pallet.findUnique({
      where: { id },
      include: PALLET_INCLUDE,
    })) as PalletRecord | null;
  }

  private matchLoadJobLine(
    loadJob: LoadJobRecord,
    pallet: PalletRecord,
  ): LoadJobLineRecord | null {
    const palletContainerId = pallet.containerDestination?.containerId ?? null;
    const palletDestinationCode =
      pallet.containerDestination?.destinationCode ?? null;

    return (
      (loadJob.lines ?? []).find((line) => {
        if (line.externalTransfer || line.plannedPallets <= 0) {
          return false;
        }

        if (line.containerDestinationId) {
          return line.containerDestinationId === pallet.containerDestinationId;
        }

        if (!line.containerId || line.containerId !== palletContainerId) {
          return false;
        }

        if (line.destinationCode) {
          return line.destinationCode === palletDestinationCode;
        }

        return true;
      }) ?? null
    );
  }

  private async loadedPalletCountForLine(
    tx: PalletCountClient,
    loadJobId: string,
    line: LoadJobLineRecord,
  ): Promise<number> {
    if (line.containerDestinationId) {
      return await tx.pallet.count({
        where: {
          status: PalletStatus.LOADED,
          loadJobId,
          containerDestinationId: line.containerDestinationId,
        },
      });
    }

    return await tx.pallet.count({
      where: {
        status: PalletStatus.LOADED,
        loadJobId,
        containerDestination: {
          is: {
            containerId: line.containerId,
            ...(line.destinationCode
              ? { destinationCode: line.destinationCode }
              : {}),
          },
        },
      },
    });
  }

  private async lockPalletRow(
    client: PalletLockClient,
    palletId: string,
  ): Promise<void> {
    await client.$queryRaw`SELECT "id" FROM "pallets" WHERE "id" = ${palletId} FOR UPDATE`;
  }

  private async recordLoadedScan(
    tx: ScanTransactionClient,
    input: {
      loadJob: LoadJobRecord;
      planLine: LoadJobLineRecord;
      pallet: PalletRecord;
      parsed: ParsedPalletQrPayload;
      deviceId: string | null;
      operatorId: string | null;
    },
  ): Promise<ScanTransactionOutcome> {
    const occurredAt = new Date();
    const event = (await tx.palletEvent.create({
      data: {
        palletId: input.pallet.id,
        loadJobId: input.loadJob.id,
        eventType: PalletEventType.LOADED,
        fromStatus: input.pallet.status,
        toStatus: PalletStatus.LOADED,
        scanPayload: input.parsed.payload,
        deviceId: input.deviceId,
        operatorId: input.operatorId,
        metadata: {
          action: 'PALLET_SCAN_LOADED',
          loadJobLineId: input.planLine.id,
          ...this.scanMetadata(input.parsed),
        },
        occurredAt,
      },
    })) as PalletEventRecord;

    const updatedPallet = (await tx.pallet.update({
      where: { id: input.pallet.id },
      data: {
        status: PalletStatus.LOADED,
        loadedAt: occurredAt,
        loadJobId: input.loadJob.id,
      },
      include: PALLET_INCLUDE,
    })) as PalletRecord;

    await this.syncContainerStatusAfterPalletChange(
      tx,
      updatedPallet.containerDestination?.containerId ?? null,
    );

    return {
      kind: 'response',
      response: await this.toScanResponse(tx, {
        result: 'LOADED',
        loadJobId: input.loadJob.id,
        pallet: updatedPallet,
        eventId: event.id,
      }),
    };
  }

  private async recordDuplicateScan(
    tx: ScanTransactionClient,
    input: {
      loadJob: LoadJobRecord;
      pallet: PalletRecord;
      parsed: ParsedPalletQrPayload;
      deviceId: string | null;
      operatorId: string | null;
    },
  ): Promise<ScanTransactionOutcome> {
    const event = (await tx.palletEvent.create({
      data: {
        palletId: input.pallet.id,
        loadJobId: input.loadJob.id,
        eventType: PalletEventType.DUPLICATE_SCAN,
        fromStatus: input.pallet.status,
        toStatus: input.pallet.status,
        scanPayload: input.parsed.payload,
        deviceId: input.deviceId,
        operatorId: input.operatorId,
        exceptionReason: 'DUPLICATE_SCAN_SAME_LOAD_JOB',
        metadata: {
          action: 'PALLET_SCAN_DUPLICATE',
          ...this.scanMetadata(input.parsed),
        },
      },
    })) as PalletEventRecord;

    return {
      kind: 'response',
      response: await this.toScanResponse(tx, {
        result: 'DUPLICATE',
        loadJobId: input.loadJob.id,
        pallet: input.pallet,
        eventId: event.id,
      }),
    };
  }

  private async recordReversedScan(
    tx: ScanTransactionClient,
    input: {
      loadJob: LoadJobRecord;
      pallet: PalletRecord;
      reason: string;
      deviceId: string | null;
      operatorId: string | null;
    },
  ): Promise<ScanTransactionOutcome> {
    const occurredAt = new Date();
    const event = (await tx.palletEvent.create({
      data: {
        palletId: input.pallet.id,
        loadJobId: input.loadJob.id,
        eventType: PalletEventType.STATUS_CHANGED,
        fromStatus: input.pallet.status,
        toStatus: PalletStatus.LABEL_PRINTED,
        scanPayload: input.pallet.qrPayload,
        deviceId: input.deviceId,
        operatorId: input.operatorId,
        exceptionReason: 'LOAD_JOB_SCAN_REVERSED',
        metadata: {
          action: 'PALLET_SCAN_REVERSED',
          reason: input.reason,
          previousLoadJobId: input.loadJob.id,
          businessPalletId: input.pallet.palletId,
        },
        occurredAt,
      },
    })) as PalletEventRecord;

    const updatedPallet = (await tx.pallet.update({
      where: { id: input.pallet.id },
      data: {
        status: PalletStatus.LABEL_PRINTED,
        loadedAt: null,
        loadJobId: null,
      },
      include: PALLET_INCLUDE,
    })) as PalletRecord;

    await this.syncContainerStatusAfterPalletChange(
      tx,
      updatedPallet.containerDestination?.containerId ?? null,
    );

    return {
      kind: 'response',
      response: await this.toScanResponse(tx, {
        result: 'REMOVED',
        loadJobId: input.loadJob.id,
        pallet: updatedPallet,
        eventId: event.id,
      }),
    };
  }

  private async createInvalidScanEvent(
    tx: PalletEventCreateClient,
    input: {
      loadJobId: string;
      palletId?: string;
      fromStatus?: PalletStatusValue;
      toStatus?: PalletStatusValue;
      scanPayload: string | null;
      deviceId: string | null;
      operatorId: string | null;
      exceptionReason: string;
      metadata: Prisma.InputJsonValue;
    },
  ): Promise<PalletEventRecord> {
    return (await tx.palletEvent.create({
      data: {
        palletId: input.palletId ?? null,
        loadJobId: input.loadJobId,
        eventType: PalletEventType.INVALID_SCAN,
        fromStatus: input.fromStatus ?? null,
        toStatus: input.toStatus ?? null,
        scanPayload: input.scanPayload,
        deviceId: input.deviceId,
        operatorId: input.operatorId,
        exceptionReason: input.exceptionReason,
        metadata: input.metadata,
      },
    })) as PalletEventRecord;
  }

  private async toScanResponse(
    tx: ScanProgressClient,
    input: {
      result: 'LOADED' | 'DUPLICATE' | 'REMOVED';
      loadJobId: string;
      pallet: PalletRecord;
      eventId: string | null;
    },
  ): Promise<LoadJobScanResponseDto> {
    const loadJob = await this.findLoadJobOrThrow(tx, input.loadJobId);
    const progress = await this.loadJobProgress(tx, loadJob);

    return {
      result: input.result,
      loadJob: this.toResponse(loadJob),
      pallet: this.toScannedPalletResponse(input.pallet),
      progress,
      eventId: input.eventId,
    };
  }

  private async syncContainerStatusAfterPalletChange(
    tx: ContainerStatusSyncClient,
    containerId: string | null,
  ): Promise<void> {
    if (!containerId) {
      return;
    }

    const activePalletCount = await tx.pallet.count({
      where: {
        status: { not: PalletStatus.CANCELLED },
        containerDestination: {
          containerId,
        },
      },
    });
    const loadedPalletCount = await tx.pallet.count({
      where: {
        status: PalletStatus.LOADED,
        containerDestination: {
          containerId,
        },
      },
    });
    const nextStatus = containerStatusFromInventoryCounts(
      activePalletCount,
      loadedPalletCount,
    );

    if (!nextStatus) {
      return;
    }

    await tx.container.update({
      where: { id: containerId },
      data: { status: nextStatus },
    });
  }

  private async loadJobProgress(
    tx: PalletCountClient,
    loadJob: LoadJobRecord,
  ): Promise<LoadJobProgressDto> {
    const totalPallets = this.systemPlannedPalletCount(loadJob);
    if (totalPallets === 0) {
      return {
        totalPallets: 0,
        loadedPallets: 0,
        remainingPallets: 0,
      };
    }

    const loadJobId = loadJob.id;
    const loadedPallets = await tx.pallet.count({
      where: {
        status: PalletStatus.LOADED,
        loadJobId,
      },
    });

    return {
      totalPallets,
      loadedPallets,
      remainingPallets: Math.max(0, totalPallets - loadedPallets),
    };
  }

  private scanError(exception: HttpException): ScanTransactionOutcome {
    return { kind: 'error', exception };
  }

  private assertClosable(record: LoadJobRecord): void {
    if (record.status === LoadJobStatus.COMPLETED) {
      throw new ConflictException({
        code: 'LOAD_JOB_ALREADY_CLOSED',
        message: `Load job ${record.id} is already closed.`,
        details: { id: record.id, status: record.status },
      });
    }

    if (record.status === LoadJobStatus.CANCELLED) {
      throw new ConflictException({
        code: 'LOAD_JOB_CANCELLED',
        message: `Load job ${record.id} was cancelled and cannot be closed.`,
        details: { id: record.id, status: record.status },
      });
    }
  }

  private closeEventMetadata(
    record: LoadJobRecord,
    dto: CloseLoadJobDto,
  ): Prisma.InputJsonValue {
    return {
      action: 'LOAD_JOB_CLOSED',
      loadJobId: record.id,
      loadNo: record.jobNo,
      fromStatus: record.status,
      toStatus: LoadJobStatus.COMPLETED,
      plannedPalletCount: this.systemPlannedPalletCount(record),
      externalPalletCount: this.externalPlannedPalletCount(record),
      reason: this.stringOrNull(dto.reason),
      note: this.stringOrNull(dto.note),
    };
  }

  private status(value: string): LoadJobStatusValue {
    if (Object.values(LoadJobStatus).includes(value as LoadJobStatusValue)) {
      return value as LoadJobStatusValue;
    }

    throw new BadRequestException({
      code: 'INVALID_LOAD_JOB_STATUS',
      message: `Invalid load job status: ${value}`,
      details: { value },
    });
  }

  private canScan(status: LoadJobStatusValue): boolean {
    return status === LoadJobStatus.IN_PROGRESS;
  }

  private parsePalletQrPayload(
    value: string | null,
  ): ParsedPalletQrPayload | null {
    if (!value) {
      return null;
    }

    const parts = value.split('|').map((part) => part.trim());
    if (parts.length < 4 || parts[0] !== 'SSP1' || parts[1] !== 'PALLET') {
      return null;
    }

    const palletId = parts[parts.length - 1];
    if (!palletId) {
      return null;
    }

    return {
      payload: value,
      version: parts[0],
      payloadType: parts[1],
      palletId,
      parts,
    };
  }

  private scanMetadata(parsed: ParsedPalletQrPayload): ScanMetadata {
    return {
      qrVersion: parsed.version,
      qrType: parsed.payloadType,
      parsedPalletId: parsed.palletId,
      payloadPartCount: parsed.parts.length,
    };
  }

  private toResponse(record: LoadJobRecord): LoadJobResponseDto {
    return {
      id: record.id,
      containerId: record.containerId,
      container: record.container
        ? {
            id: record.container.id,
            containerNo: record.container.containerNo,
          }
        : null,
      loadNo: record.jobNo,
      truckNo: record.truckNo,
      carrier: record.carrier,
      destinationRegion: record.destinationRegion,
      status: record.status,
      canScan: this.canScan(record.status),
      createdById: record.createdById,
      createdBy: record.createdBy
        ? {
            id: record.createdBy.id,
            email: record.createdBy.email,
            name: record.createdBy.name,
            role: record.createdBy.role,
          }
        : null,
      startedAt: this.isoDateOrNull(record.startedAt),
      scheduledDepartureAt: this.isoDateOrNull(record.scheduledDepartureAt),
      closedAt: this.isoDateOrNull(record.closedAt),
      createdAt: this.isoDate(record.createdAt),
      updatedAt: this.isoDate(record.updatedAt),
      lines: (record.lines ?? []).map((line) => this.toLineResponse(line)),
      plannedPalletCount: this.systemPlannedPalletCount(record),
      externalPalletCount: this.externalPlannedPalletCount(record),
      palletCount: record._count?.pallets ?? 0,
      eventCount: record._count?.events ?? 0,
    };
  }

  private toLineResponse(line: LoadJobLineRecord): LoadJobLineResponseDto {
    return {
      id: line.id,
      sequence: line.sequence,
      sourceText: line.sourceText,
      containerNo: line.containerNo,
      containerId: line.containerId,
      container: line.container
        ? {
            id: line.container.id,
            containerNo: line.container.containerNo,
          }
        : null,
      containerDestinationId: line.containerDestinationId,
      destinationCode: line.destinationCode,
      plannedPallets: line.plannedPallets,
      externalTransfer: line.externalTransfer,
      note: line.note,
      createdAt: this.isoDate(line.createdAt),
      updatedAt: this.isoDate(line.updatedAt),
    };
  }

  private systemPlannedPalletCount(record: LoadJobRecord): number {
    return (record.lines ?? [])
      .filter((line) => !line.externalTransfer)
      .reduce((total, line) => total + line.plannedPallets, 0);
  }

  private externalPlannedPalletCount(record: LoadJobRecord): number {
    return (record.lines ?? [])
      .filter((line) => line.externalTransfer)
      .reduce((total, line) => total + line.plannedPallets, 0);
  }

  private toScannedPalletResponse(
    pallet: PalletRecord,
  ): ScannedPalletResponseDto {
    return {
      id: pallet.id,
      containerId: pallet.containerDestination?.containerId ?? '',
      containerNo: pallet.containerDestination?.container?.containerNo ?? '',
      containerDestinationId: pallet.containerDestinationId,
      destinationCode: pallet.containerDestination?.destinationCode ?? '',
      destinationType: pallet.containerDestination?.destinationType ?? null,
      palletNo: pallet.palletNo,
      palletId: pallet.palletId,
      qrPayload: pallet.qrPayload,
      status: pallet.status,
      loadedAt: this.isoDateOrNull(pallet.loadedAt),
      loadJobId: pallet.loadJobId,
    };
  }

  private requiredString(value: string, fieldName: string): string {
    const result = this.stringOrNull(value);
    if (result) {
      return result;
    }

    throw new BadRequestException({
      code: 'LOAD_JOB_FIELD_REQUIRED',
      message: `${fieldName} is required.`,
      details: { fieldName },
    });
  }

  private stringOrNull(value: string | null | undefined): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private isoDate(value: Date | string): string {
    return value instanceof Date ? value.toISOString() : value;
  }

  private isoDateOrNull(value: Date | string | null): string | null {
    return value ? this.isoDate(value) : null;
  }

  private throwConflictIfUnique(error: unknown, code: string): void {
    if (this.isPrismaError(error, 'P2002')) {
      throw new ConflictException({
        code,
        message: 'A load job with the same loadNo already exists.',
        details: { target: this.errorMetaTarget(error) },
      });
    }
  }

  private isPrismaError(
    error: unknown,
    code: string,
  ): error is { code: string; meta?: { target?: unknown } } {
    return (
      error !== null &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: unknown }).code === code
    );
  }

  private errorMetaTarget(error: { meta?: { target?: unknown } }): unknown {
    return error.meta?.target ?? null;
  }
}
