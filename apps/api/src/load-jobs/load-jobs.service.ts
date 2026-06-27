import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CloseLoadJobDto } from './dto/close-load-job.dto';
import { CreateLoadJobDto } from './dto/create-load-job.dto';
import { ListLoadJobsQueryDto } from './dto/list-load-jobs-query.dto';
import {
  LoadJobListResponseDto,
  LoadJobResponseDto,
} from './dto/load-job-response.dto';
import { LoadJobStatus, PalletEventType } from '../generated/prisma/enums';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type LoadJobStatusValue = (typeof LoadJobStatus)[keyof typeof LoadJobStatus];

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
  containerId: string;
  container?: ContainerRecord | null;
  jobNo: string | null;
  truckNo: string | null;
  carrier: string | null;
  destinationRegion: string | null;
  status: LoadJobStatusValue;
  startedAt: Date | string | null;
  closedAt: Date | string | null;
  createdById: string | null;
  createdBy?: UserRecord | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  _count?: {
    pallets?: number;
    events?: number;
  };
}

interface ContainerLookupClient {
  container: {
    findUnique(args: unknown): Promise<unknown>;
  };
}

interface UserLookupClient {
  user: {
    findUnique(args: unknown): Promise<unknown>;
  };
}

const LOAD_JOB_INCLUDE = {
  container: {
    select: {
      id: true,
      containerNo: true,
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

@Injectable()
export class LoadJobsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateLoadJobDto): Promise<LoadJobResponseDto> {
    await this.assertContainerExists(this.prisma, dto.containerId);
    if (dto.createdById) {
      await this.assertUserExists(
        this.prisma,
        dto.createdById,
        'LOAD_JOB_CREATED_BY_NOT_FOUND',
      );
    }

    const loadNo = this.requiredString(dto.loadNo, 'loadNo');
    const startedAt = dto.startedAt ? new Date(dto.startedAt) : new Date();

    try {
      const record = (await this.prisma.loadJob.create({
        data: {
          containerId: dto.containerId,
          jobNo: loadNo,
          truckNo: this.stringOrNull(dto.truckNo),
          carrier: this.stringOrNull(dto.carrier),
          destinationRegion: this.stringOrNull(dto.destinationRegion),
          status: LoadJobStatus.IN_PROGRESS,
          startedAt,
          closedAt: null,
          createdById: this.stringOrNull(dto.createdById),
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
      where.containerId = query.containerId;
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

  async close(id: string, dto: CloseLoadJobDto): Promise<LoadJobResponseDto> {
    const closedAt = new Date();

    const record = (await this.prisma.$transaction(async (tx) => {
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
    })) as LoadJobRecord;

    return this.toResponse(record);
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
      closedAt: this.isoDateOrNull(record.closedAt),
      createdAt: this.isoDate(record.createdAt),
      updatedAt: this.isoDate(record.updatedAt),
      palletCount: record._count?.pallets ?? 0,
      eventCount: record._count?.events ?? 0,
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
