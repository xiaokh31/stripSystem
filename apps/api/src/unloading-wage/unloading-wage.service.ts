import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, join, resolve, sep } from 'node:path';
import { auditUserId } from '../auth/audit-user';
import { AuthenticatedUser } from '../auth/auth-user';
import {
  ContainerPayClassification,
  CorrectionTargetType,
  GeneratedFileStatus,
  PayAllocationMethod,
  PayContainerStatus,
  UnloadingWageSettlementStatus,
  WageGeneratedFileType,
} from '../generated/prisma/enums';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CompleteContainerUnloadingDto,
  CompleteUnloadingDto,
  ContainerUnloaderDto,
  ContainerUnloadingWageResponseDto,
  CreateUnloadingWorkerDto,
  CreatePayContainerDto,
  GenerateUnloadingWageSettlementDto,
  ListPayContainersQueryDto,
  ListUnloadingWorkersQueryDto,
  PayContainerListResponseDto,
  PayContainerResponseDto,
  SaveContainerUnloadingWageDto,
  UnloadingWageWorkerListResponseDto,
  UnloadingWageWorkerResponseDto,
  UpdateContainerPayClassificationDto,
  UpdateContainerUnloadersDto,
  UpdateContainerUnloadingWageAssociationsDto,
  UpdateUnloadingWorkerDto,
  UnloadingWageSettlementListResponseDto,
  UnloadingWageSettlementResponseDto,
} from './dto/unloading-wage.dto';

type ClassificationValue =
  (typeof ContainerPayClassification)[keyof typeof ContainerPayClassification];
type AllocationMethodValue =
  (typeof PayAllocationMethod)[keyof typeof PayAllocationMethod];

interface ContainerRecord {
  id: string;
  containerNo: string;
  payClassification: string | null;
  payTrailerNumber: string | null;
}

interface ContainerUnloadingWageRecord extends ContainerRecord {
  payContainerLinks?: Array<{
    id: string;
    payContainerId: string;
    payContainer: PayContainerRecord;
  }>;
}

interface PayContainerRecord {
  id: string;
  payContainerNo: string;
  classification: ClassificationValue;
  trailerNumber: string | null;
  status: string;
  currency: string;
  rateAmount: { toString(): string } | number | string;
  allocationMethod: AllocationMethodValue;
  completedAt: Date | string | null;
  completedById: string | null;
  completionNote: string | null;
  sourceContainers?: PayContainerContainerRecord[];
  unloaders?: UnloaderAssignmentRecord[];
  createdAt: Date | string;
  updatedAt: Date | string;
}

interface PayContainerContainerRecord {
  id: string;
  containerId: string;
  containerNo: string;
}

interface UnloaderAssignmentRecord {
  id: string;
  unloadingWorkerId: string | null;
  workerUserId: string | null;
  workerCode: string;
  workerName: string;
  allocationAmount: { toString(): string } | number | string | null;
  allocationPercent: { toString(): string } | number | string | null;
  note: string | null;
}

interface SettlementRecord {
  id: string;
  settlementMonth: string;
  currency: string;
  status: string;
  totalAmount: { toString(): string } | number | string;
  warningCount: number;
  errorCount: number;
  rawJson: unknown;
  workerSummaries?: WorkerSettlementRecord[];
  lines?: SettlementLineRecord[];
  generatedFiles?: WageGeneratedFileRecord[];
  createdAt: Date | string;
  updatedAt: Date | string;
}

interface WorkerSettlementRecord {
  id: string;
  workerCode: string;
  workerName: string;
  payContainerCount: number;
  totalAmount: { toString(): string } | number | string;
}

interface SettlementLineRecord {
  id: string;
  workerCode: string;
  workerName: string;
  payContainerNo: string;
  classification: string;
  trailerNumber: string | null;
  containerNumbers: unknown;
  completedAt: Date | string;
  rateAmount: { toString(): string } | number | string;
  allocationMethod: string;
  amount: { toString(): string } | number | string;
}

interface WageGeneratedFileRecord {
  id: string;
  fileType: string;
  storagePath: string;
  fileSha256: string | null;
  mimeType?: string | null;
  fileSizeBytes?: bigint | number | string | null;
  status: string;
}

interface WageGeneratedFileDownload {
  buffer: Buffer;
  filename: string;
  fileSizeBytes: number;
  mimeType: string;
}

interface SettlementIssue {
  code: string;
  message: string;
  payContainerId?: string;
  payContainerNo?: string;
}

interface SettlementAllocation {
  workerCode: string;
  workerName: string;
  amountCents: number;
}

interface SettlementInput {
  payContainer: PayContainerRecord;
  containerNumbers: string[];
  allocations: SettlementAllocation[];
}

interface ExistingPayContainerLinkRecord {
  id: string;
  payContainerId: string;
  containerId: string;
  containerNo: string;
  payContainer: PayContainerRecord;
}

interface UnloadingWorkerRecord {
  id: string;
  displayName: string;
  workerCode: string;
  isActive: boolean;
  phone: string | null;
  note: string | null;
  createdById: string | null;
  updatedById: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

type UnloadingWageTransaction = Pick<
  PrismaService,
  | 'container'
  | 'correctionFeedback'
  | 'payContainer'
  | 'payContainerContainer'
  | 'unloaderAssignment'
  | 'unloadingWageSettlement'
>;

@Injectable()
export class UnloadingWageService {
  private readonly storageRoot: string;

  constructor(
    private readonly prisma: PrismaService,
    configService: ConfigService,
  ) {
    this.storageRoot = configService.getOrThrow<string>('app.storageRoot');
  }

  async listWorkers(
    query: ListUnloadingWorkersQueryDto = {},
  ): Promise<UnloadingWageWorkerListResponseDto> {
    const workers = (await this.prisma.unloadingWorker.findMany({
      where: query.includeInactive ? {} : { isActive: true },
      orderBy: [{ displayName: 'asc' }, { workerCode: 'asc' }],
    })) as UnloadingWorkerRecord[];

    return {
      items: workers.map((worker) => this.toWorkerResponse(worker)),
    };
  }

  async createWorker(
    dto: CreateUnloadingWorkerDto,
    actor: AuthenticatedUser,
  ): Promise<UnloadingWageWorkerResponseDto> {
    const displayName = this.requiredString(dto.displayName, 'displayName');
    const workerCode =
      this.stringOrNull(dto.workerCode) ??
      (await this.generatedTemporaryWorkerCode());
    await this.assertWorkerCodeAvailable(workerCode);
    const actorId = auditUserId(actor);

    const worker = (await this.prisma.unloadingWorker.create({
      data: {
        displayName,
        workerCode,
        isActive: dto.isActive ?? true,
        phone: this.stringOrNull(dto.phone),
        note: this.stringOrNull(dto.note),
        createdById: actorId,
        updatedById: actorId,
      },
    })) as UnloadingWorkerRecord;

    return this.toWorkerResponse(worker);
  }

  async updateWorker(
    workerId: string,
    dto: UpdateUnloadingWorkerDto,
    actor: AuthenticatedUser,
  ): Promise<UnloadingWageWorkerResponseDto> {
    const existing = (await this.prisma.unloadingWorker.findUnique({
      where: { id: workerId },
    })) as UnloadingWorkerRecord | null;
    if (!existing) {
      throw new NotFoundException({
        code: 'UNLOADING_WORKER_NOT_FOUND',
        message: `Unloading worker ${workerId} was not found.`,
        details: { workerId },
      });
    }

    const data: Record<string, unknown> = {};
    if (dto.displayName !== undefined) {
      data.displayName = this.requiredString(dto.displayName, 'displayName');
    }
    if (dto.workerCode !== undefined) {
      const workerCode = this.requiredString(dto.workerCode, 'workerCode');
      if (workerCode !== existing.workerCode) {
        await this.assertWorkerCodeAvailable(workerCode, existing.id);
      }
      data.workerCode = workerCode;
    }
    if (dto.isActive !== undefined) {
      data.isActive = dto.isActive;
    }
    if (dto.phone !== undefined) {
      data.phone = this.stringOrNull(dto.phone);
    }
    if (dto.note !== undefined) {
      data.note = this.stringOrNull(dto.note);
    }
    if (Object.keys(data).length === 0) {
      throw new BadRequestException({
        code: 'UNLOADING_WORKER_UPDATE_REQUIRED',
        message: 'At least one unloading worker field must be changed.',
        details: { workerId },
      });
    }
    data.updatedById = auditUserId(actor);

    const worker = (await this.prisma.unloadingWorker.update({
      where: { id: workerId },
      data,
    })) as UnloadingWorkerRecord;

    return this.toWorkerResponse(worker);
  }

  async updateContainerPayClassification(
    containerId: string,
    dto: UpdateContainerPayClassificationDto,
    actor: AuthenticatedUser,
  ): Promise<{ container: ContainerRecord }> {
    const classification = this.classification(dto.classification);
    const trailerNumber = this.trailerNumberOrNull(
      classification,
      dto.trailerNumber,
    );
    const existing = await this.findContainerOrThrow(containerId);
    const correctedById = auditUserId(actor);

    const container = (await this.prisma.$transaction(async (tx) => {
      const updated = await tx.container.update({
        where: { id: containerId },
        data: {
          payClassification: classification,
          payTrailerNumber: trailerNumber,
        },
      });

      await tx.correctionFeedback.create({
        data: {
          targetType: CorrectionTargetType.CONTAINER,
          containerId,
          fieldName: 'payClassification',
          oldValue: this.nullableJsonValue({
            payClassification: existing.payClassification,
            payTrailerNumber: existing.payTrailerNumber,
          }),
          newValue: this.nullableJsonValue({
            payClassification: classification,
            payTrailerNumber: trailerNumber,
          }),
          reason:
            this.stringOrNull(dto.reason) ??
            'Container pay classification updated',
          note: this.stringOrNull(dto.note),
          correctedById,
        },
      });

      return updated;
    })) as ContainerRecord;

    return { container };
  }

  async saveContainerUnloadingWage(
    containerId: string,
    dto: SaveContainerUnloadingWageDto,
    actor: AuthenticatedUser,
  ): Promise<ContainerUnloadingWageResponseDto> {
    const classification = this.classification(dto.classification);
    const trailerNumber = this.trailerNumberOrNull(
      classification,
      dto.trailerNumber,
    );
    const container = await this.findContainerOrThrow(containerId);
    const rateAmount = this.moneyString(
      await this.rateForClassification(classification),
    );
    const correctedById = auditUserId(actor);

    await this.prisma.$transaction(async (tx) => {
      await this.syncContainerDetailPayUnit(tx, {
        classification,
        containers: [container],
        correctedById,
        fieldName: 'unloadingWage',
        note: this.stringOrNull(dto.note),
        rateAmount,
        reason:
          this.stringOrNull(dto.reason) ??
          'Container detail unloading wage saved',
        trailerNumber,
      });
    });

    return this.getContainerUnloadingWage(containerId);
  }

  async updateContainerUnloadingWageAssociations(
    containerId: string,
    dto: UpdateContainerUnloadingWageAssociationsDto,
    actor: AuthenticatedUser,
  ): Promise<ContainerUnloadingWageResponseDto> {
    const primaryContainer = await this.findContainerOrThrow(containerId);
    const trailerNumber = this.trailerNumberOrNull(
      ContainerPayClassification.US_TO_CANADA_TRANSFER,
      dto.trailerNumber ?? primaryContainer.payTrailerNumber,
    );
    const associatedContainers = await this.findAssociatedContainersOrThrow(
      dto.associatedContainerIds ?? [],
      dto.associatedContainerNos ?? [],
    );
    const containers = this.uniqueContainers([
      primaryContainer,
      ...associatedContainers,
    ]);
    const correctedById = auditUserId(actor);

    await this.prisma.$transaction(async (tx) => {
      await this.syncContainerDetailPayUnit(tx, {
        classification: ContainerPayClassification.US_TO_CANADA_TRANSFER,
        containers,
        correctedById,
        fieldName: 'unloadingWageAssociations',
        note: this.stringOrNull(dto.note),
        rateAmount: this.moneyString(
          await this.rateForClassification(
            ContainerPayClassification.US_TO_CANADA_TRANSFER,
          ),
        ),
        reason:
          this.stringOrNull(dto.reason) ??
          'Container detail unloading wage associations updated',
        trailerNumber,
      });
    });

    return this.getContainerUnloadingWage(containerId);
  }

  async completeContainerUnloading(
    containerId: string,
    dto: CompleteContainerUnloadingDto,
    actor: AuthenticatedUser,
  ): Promise<ContainerUnloadingWageResponseDto> {
    const payContainer =
      await this.findPayContainerForContainerOrThrow(containerId);
    const completedAt = this.dateTime(dto.completedAt, 'completedAt');
    const completedById = auditUserId(actor);
    const nextStatus =
      payContainer.status === PayContainerStatus.SETTLED
        ? PayContainerStatus.NEEDS_REVIEW
        : PayContainerStatus.COMPLETED;

    await this.prisma.$transaction(async (tx) => {
      await this.markRelatedSettlementsNeedReview(tx, [payContainer.id]);
      await tx.payContainer.update({
        where: { id: payContainer.id },
        data: {
          completedAt,
          completedById,
          completionNote: this.stringOrNull(dto.note),
          status: nextStatus,
        },
      });
      await tx.correctionFeedback.create({
        data: {
          targetType: CorrectionTargetType.PAY_CONTAINER,
          payContainerId: payContainer.id,
          fieldName: 'unloadingCompletion',
          oldValue: this.nullableJsonValue({
            status: payContainer.status,
            completedAt: payContainer.completedAt,
            completedById: payContainer.completedById,
            completionNote: payContainer.completionNote,
          }),
          newValue: this.nullableJsonValue({
            status: nextStatus,
            completedAt: completedAt.toISOString(),
            completedById,
            completionNote: this.stringOrNull(dto.note),
          }),
          reason:
            this.stringOrNull(dto.reason) ??
            'Container detail unloading marked completed',
          note: this.stringOrNull(dto.note),
          correctedById: completedById,
        },
      });
    });

    return this.getContainerUnloadingWage(containerId);
  }

  async updateContainerUnloaders(
    containerId: string,
    dto: UpdateContainerUnloadersDto,
    actor: AuthenticatedUser,
  ): Promise<ContainerUnloadingWageResponseDto> {
    const payContainer =
      await this.findPayContainerForContainerOrThrow(containerId);
    const unloaders = await this.containerUnloaderInputs(dto.unloaders);
    const correctedById = auditUserId(actor);
    const nextStatus =
      payContainer.status === PayContainerStatus.SETTLED
        ? PayContainerStatus.NEEDS_REVIEW
        : this.payContainerStatus(payContainer.status);

    await this.prisma.$transaction(async (tx) => {
      await this.markRelatedSettlementsNeedReview(tx, [payContainer.id]);
      await tx.unloaderAssignment.deleteMany({
        where: { payContainerId: payContainer.id },
      });
      for (const unloader of unloaders) {
        await tx.unloaderAssignment.create({
          data: {
            payContainerId: payContainer.id,
            unloadingWorkerId: unloader.unloadingWorkerId,
            workerUserId: unloader.workerUserId,
            workerCode: unloader.workerCode,
            workerName: unloader.workerName,
            note: unloader.note,
          },
        });
      }
      if (nextStatus !== payContainer.status) {
        await tx.payContainer.update({
          where: { id: payContainer.id },
          data: { status: nextStatus },
        });
      }
      await tx.correctionFeedback.create({
        data: {
          targetType: CorrectionTargetType.PAY_CONTAINER,
          payContainerId: payContainer.id,
          fieldName: 'unloaders',
          oldValue: this.nullableJsonValue(
            payContainer.unloaders?.map((unloader) => ({
              unloadingWorkerId: unloader.unloadingWorkerId,
              workerCode: unloader.workerCode,
              workerName: unloader.workerName,
              workerUserId: unloader.workerUserId,
              note: unloader.note,
            })) ?? [],
          ),
          newValue: this.nullableJsonValue(unloaders),
          reason:
            this.stringOrNull(dto.reason) ??
            'Container detail unloaders updated',
          note: this.stringOrNull(dto.note),
          correctedById,
        },
      });
    });

    return this.getContainerUnloadingWage(containerId);
  }

  async createPayContainer(
    dto: CreatePayContainerDto,
    actor: AuthenticatedUser,
  ): Promise<PayContainerResponseDto> {
    const classification = this.classification(dto.classification);
    const trailerNumber = this.trailerNumberOrNull(
      classification,
      dto.trailerNumber,
    );
    this.assertContainerCount(classification, dto.containerIds);
    const containers = await this.findContainersOrThrow(dto.containerIds);
    const rateAmount = this.moneyString(
      dto.rateAmount ?? (await this.rateForClassification(classification)),
    );
    const payContainerNo = this.payContainerNo(
      classification,
      trailerNumber ?? containers[0].containerNo,
    );
    const createdById = auditUserId(actor);

    const created = (await this.prisma.$transaction(async (tx) => {
      const payContainer = await tx.payContainer.create({
        data: {
          payContainerNo,
          classification,
          trailerNumber,
          currency: 'CAD',
          rateAmount,
          allocationMethod: PayAllocationMethod.EQUAL_SPLIT,
          status: PayContainerStatus.DRAFT,
          createdById,
        },
      });

      for (const container of containers) {
        await tx.container.update({
          where: { id: container.id },
          data: {
            payClassification: classification,
            payTrailerNumber: trailerNumber,
          },
        });
        await tx.payContainerContainer.create({
          data: {
            payContainerId: payContainer.id,
            containerId: container.id,
            containerNo: container.containerNo,
          },
        });
        await tx.correctionFeedback.create({
          data: {
            targetType: CorrectionTargetType.CONTAINER,
            containerId: container.id,
            fieldName: 'payContainer',
            oldValue: this.nullableJsonValue({
              payClassification: container.payClassification,
              payTrailerNumber: container.payTrailerNumber,
            }),
            newValue: this.nullableJsonValue({
              payClassification: classification,
              payTrailerNumber: trailerNumber,
              payContainerId: payContainer.id,
              payContainerNo,
            }),
            reason: this.stringOrNull(dto.reason) ?? 'Pay container created',
            correctedById: createdById,
          },
        });
      }

      await tx.correctionFeedback.create({
        data: {
          targetType: CorrectionTargetType.PAY_CONTAINER,
          payContainerId: payContainer.id,
          fieldName: 'created',
          oldValue: this.nullableJsonValue(null),
          newValue: this.nullableJsonValue({
            payContainerNo,
            classification,
            trailerNumber,
            containerIds: containers.map((container) => container.id),
          }),
          reason: this.stringOrNull(dto.reason) ?? 'Pay container created',
          correctedById: createdById,
        },
      });

      return payContainer;
    })) as PayContainerRecord;

    return this.getPayContainer(created.id);
  }

  async getPayContainer(id: string): Promise<PayContainerResponseDto> {
    return this.toPayContainerResponse(await this.findPayContainerOrThrow(id));
  }

  async listPayContainers(
    query: ListPayContainersQueryDto,
  ): Promise<PayContainerListResponseDto> {
    const where: Prisma.PayContainerWhereInput = {};
    if (query.status) {
      where.status = this.payContainerStatus(query.status);
    }
    if (query.settlementMonth) {
      where.completedAt = this.monthRange(query.settlementMonth);
    }

    const records = (await this.prisma.payContainer.findMany({
      where,
      include: {
        sourceContainers: { orderBy: { containerNo: 'asc' } },
        unloaders: { orderBy: { workerCode: 'asc' } },
      },
      orderBy: [
        { completedAt: 'desc' },
        { createdAt: 'desc' },
        { payContainerNo: 'asc' },
      ],
      skip: query.offset,
      take: query.limit,
    })) as PayContainerRecord[];

    return {
      items: records.map((record) => this.toPayContainerResponse(record)),
      limit: query.limit,
      offset: query.offset,
    };
  }

  async completePayContainer(
    id: string,
    dto: CompleteUnloadingDto,
    actor: AuthenticatedUser,
  ): Promise<PayContainerResponseDto> {
    const existing = await this.findPayContainerOrThrow(id);
    this.assertCanComplete(existing);
    const completedAt = this.dateTime(dto.completedAt, 'completedAt');
    const allocationMethod = this.allocationMethod(dto.allocationMethod);
    this.validateUnloaderAssignments(existing, allocationMethod, dto.unloaders);
    const completedById = auditUserId(actor);

    await this.prisma.$transaction(async (tx) => {
      await tx.unloaderAssignment.deleteMany({
        where: { payContainerId: id },
      });
      await tx.payContainer.update({
        where: { id },
        data: {
          status: PayContainerStatus.COMPLETED,
          completedAt,
          completedById,
          completionNote: this.stringOrNull(dto.note),
          allocationMethod,
        },
      });
      for (const unloader of dto.unloaders) {
        await tx.unloaderAssignment.create({
          data: {
            payContainerId: id,
            workerUserId: this.stringOrNull(unloader.workerUserId),
            workerCode: this.requiredString(unloader.workerCode, 'workerCode'),
            workerName: this.requiredString(unloader.workerName, 'workerName'),
            allocationAmount:
              unloader.allocationAmount === undefined ||
              unloader.allocationAmount === null
                ? null
                : this.moneyString(unloader.allocationAmount),
            allocationPercent:
              unloader.allocationPercent === undefined ||
              unloader.allocationPercent === null
                ? null
                : this.percentString(unloader.allocationPercent),
            note: this.stringOrNull(unloader.note),
          },
        });
      }
      await tx.correctionFeedback.create({
        data: {
          targetType: CorrectionTargetType.PAY_CONTAINER,
          payContainerId: id,
          fieldName: 'unloadingCompletion',
          oldValue: this.nullableJsonValue({
            status: existing.status,
            completedAt: existing.completedAt,
            allocationMethod: existing.allocationMethod,
          }),
          newValue: this.nullableJsonValue({
            status: PayContainerStatus.COMPLETED,
            completedAt: completedAt.toISOString(),
            allocationMethod,
            unloaders: dto.unloaders,
          }),
          reason: this.stringOrNull(dto.reason) ?? 'Unloading completed',
          note: this.stringOrNull(dto.note),
          correctedById: completedById,
        },
      });
    });

    return this.getPayContainer(id);
  }

  async generateSettlement(
    dto: GenerateUnloadingWageSettlementDto,
    actor: AuthenticatedUser,
  ): Promise<UnloadingWageSettlementResponseDto> {
    const payContainers = (await this.prisma.payContainer.findMany({
      where: {
        status: {
          in: [PayContainerStatus.COMPLETED, PayContainerStatus.SETTLED],
        },
        completedAt: this.monthRange(dto.settlementMonth),
      },
      include: {
        sourceContainers: true,
        unloaders: true,
      },
      orderBy: { payContainerNo: 'asc' },
    })) as PayContainerRecord[];

    if (payContainers.length === 0) {
      throw new BadRequestException({
        code: 'NO_COMPLETED_PAY_CONTAINERS',
        message: 'No completed pay containers were found for settlement month.',
        details: { settlementMonth: dto.settlementMonth },
      });
    }

    const warnings: SettlementIssue[] = [];
    const errors: SettlementIssue[] = [];
    const settlementInputs = this.settlementInputs(
      payContainers,
      warnings,
      errors,
    );
    if (settlementInputs.length === 0) {
      throw new BadRequestException({
        code: 'NO_PAYABLE_PAY_CONTAINERS',
        message: 'No pay containers can be settled after validation.',
        details: { settlementMonth: dto.settlementMonth, warnings, errors },
      });
    }

    const generatedById = auditUserId(actor);
    const settlement = (await this.prisma.$transaction(async (tx) => {
      await tx.unloadingWageSettlement.updateMany({
        where: {
          settlementMonth: dto.settlementMonth,
          status: UnloadingWageSettlementStatus.GENERATED,
        },
        data: { status: UnloadingWageSettlementStatus.SUPERSEDED },
      });

      const created = await tx.unloadingWageSettlement.create({
        data: {
          settlementMonth: dto.settlementMonth,
          currency: 'CAD',
          status:
            errors.length > 0
              ? UnloadingWageSettlementStatus.NEEDS_REVIEW
              : UnloadingWageSettlementStatus.GENERATED,
          totalAmount: this.moneyString(
            settlementInputs.reduce(
              (total, input) =>
                total + this.moneyCents(input.payContainer.rateAmount),
              0,
            ) / 100,
          ),
          warningCount: warnings.length,
          errorCount: errors.length,
          rawJson: this.jsonValue({
            warnings,
            errors,
            payContainerCount: settlementInputs.length,
            payContainers: settlementInputs.map((input) =>
              this.settlementInputSnapshot(input),
            ),
          }),
          generatedById,
        },
      });

      const workerTotals = this.workerTotals(settlementInputs);
      const workerIds = new Map<string, string>();
      for (const worker of workerTotals.values()) {
        const workerRecord = await tx.unloadingWageWorkerSettlement.create({
          data: {
            settlementId: created.id,
            workerCode: worker.workerCode,
            workerName: worker.workerName,
            payContainerCount: worker.payContainerCount,
            totalAmount: this.moneyString(worker.totalCents / 100),
          },
        });
        workerIds.set(worker.workerCode, workerRecord.id);
      }

      for (const input of settlementInputs) {
        for (const allocation of input.allocations) {
          await tx.unloadingWageSettlementLine.create({
            data: {
              settlementId: created.id,
              workerSettlementId: workerIds.get(allocation.workerCode) ?? '',
              payContainerId: input.payContainer.id,
              payContainerNo: input.payContainer.payContainerNo,
              classification: input.payContainer.classification,
              trailerNumber: input.payContainer.trailerNumber,
              containerNumbers: this.jsonValue(input.containerNumbers),
              completedAt: this.dateTimeRequired(
                input.payContainer.completedAt,
              ),
              rateAmount: this.moneyString(input.payContainer.rateAmount),
              allocationMethod: input.payContainer.allocationMethod,
              workerCode: allocation.workerCode,
              workerName: allocation.workerName,
              amount: this.moneyString(allocation.amountCents / 100),
            },
          });
        }
        await tx.payContainer.update({
          where: { id: input.payContainer.id },
          data: { status: PayContainerStatus.SETTLED },
        });
      }

      await tx.correctionFeedback.create({
        data: {
          targetType: CorrectionTargetType.UNLOADING_WAGE_SETTLEMENT,
          unloadingWageSettlementId: created.id,
          fieldName: 'generated',
          oldValue: this.nullableJsonValue(null),
          newValue: this.nullableJsonValue({
            settlementMonth: dto.settlementMonth,
            payContainerCount: settlementInputs.length,
          }),
          reason: 'Monthly unloading wage settlement generated',
          correctedById: generatedById,
        },
      });

      return created;
    })) as SettlementRecord;

    const fullSettlement = await this.findSettlementOrThrow(settlement.id);
    await this.writeSettlementArtifacts(
      fullSettlement,
      warnings,
      errors,
      generatedById,
    );
    return this.getSettlement(settlement.id);
  }

  async listSettlements(): Promise<UnloadingWageSettlementListResponseDto> {
    const records = (await this.prisma.unloadingWageSettlement.findMany({
      include: {
        workerSummaries: { orderBy: { workerCode: 'asc' } },
        lines: { orderBy: [{ workerCode: 'asc' }, { payContainerNo: 'asc' }] },
        generatedFiles: true,
      },
      orderBy: { createdAt: 'desc' },
    })) as SettlementRecord[];

    return {
      items: records.map((record) => this.toSettlementResponse(record)),
    };
  }

  async getSettlement(id: string): Promise<UnloadingWageSettlementResponseDto> {
    return this.toSettlementResponse(await this.findSettlementOrThrow(id));
  }

  async downloadSettlementFile(
    settlementId: string,
    fileId: string,
  ): Promise<WageGeneratedFileDownload> {
    await this.findSettlementOrThrow(settlementId);
    const record = (await this.prisma.wageGeneratedFile.findFirst({
      where: { id: fileId, unloadingWageSettlementId: settlementId },
    })) as WageGeneratedFileRecord | null;

    if (!record) {
      throw new NotFoundException({
        code: 'WAGE_GENERATED_FILE_NOT_FOUND',
        message: `Generated wage file ${fileId} was not found for settlement ${settlementId}.`,
        details: { settlementId, fileId },
      });
    }

    if (record.status !== GeneratedFileStatus.GENERATED) {
      throw new BadRequestException({
        code: 'WAGE_GENERATED_FILE_NOT_DOWNLOADABLE',
        message: `Generated wage file ${fileId} is not downloadable because its status is ${record.status}.`,
        details: { settlementId, fileId, status: record.status },
      });
    }

    return this.downloadWageGeneratedFile(record, { settlementId, fileId });
  }

  private async syncContainerDetailPayUnit(
    tx: UnloadingWageTransaction,
    input: {
      classification: ClassificationValue;
      containers: ContainerRecord[];
      correctedById: string | null;
      fieldName: string;
      note: string | null;
      rateAmount: string;
      reason: string;
      trailerNumber: string | null;
    },
  ): Promise<void> {
    if (input.containers.length === 0) {
      throw new BadRequestException({
        code: 'NO_CONTAINERS_FOR_UNLOADING_WAGE',
        message: 'At least one container is required.',
        details: {},
      });
    }
    this.assertContainerCount(
      input.classification,
      input.containers.map((c) => c.id),
    );

    const containerIds = input.containers.map((container) => container.id);
    const primaryContainer = input.containers[0];
    const existingLinks = (await tx.payContainerContainer.findMany({
      where: { containerId: { in: containerIds } },
      include: { payContainer: true },
    })) as ExistingPayContainerLinkRecord[];
    const primaryLink = existingLinks.find(
      (link) => link.containerId === primaryContainer.id,
    );
    const targetPayContainer =
      primaryLink?.payContainer ?? existingLinks[0]?.payContainer ?? null;
    const payContainerNo = this.payContainerNo(
      input.classification,
      input.trailerNumber ?? primaryContainer.containerNo,
    );
    const stalePayContainerIds = [
      ...new Set(
        existingLinks
          .map((link) => link.payContainerId)
          .concat(targetPayContainer?.id ?? []),
      ),
    ].filter(Boolean);
    await this.markRelatedSettlementsNeedReview(tx, stalePayContainerIds);

    const payContainer = targetPayContainer
      ? ((await tx.payContainer.update({
          where: { id: targetPayContainer.id },
          data: {
            payContainerNo,
            classification: input.classification,
            trailerNumber: input.trailerNumber,
            rateAmount: input.rateAmount,
            status:
              targetPayContainer.status === PayContainerStatus.SETTLED
                ? PayContainerStatus.NEEDS_REVIEW
                : this.payContainerStatus(targetPayContainer.status),
          },
        })) as PayContainerRecord)
      : ((await tx.payContainer.create({
          data: {
            payContainerNo,
            classification: input.classification,
            trailerNumber: input.trailerNumber,
            currency: 'CAD',
            rateAmount: input.rateAmount,
            allocationMethod: PayAllocationMethod.EQUAL_SPLIT,
            status: PayContainerStatus.DRAFT,
            createdById: input.correctedById,
          },
        })) as PayContainerRecord);

    await tx.payContainerContainer.deleteMany({
      where: {
        OR: [
          { payContainerId: payContainer.id },
          { containerId: { in: containerIds } },
        ],
      },
    });

    for (const container of input.containers) {
      await tx.container.update({
        where: { id: container.id },
        data: {
          payClassification: input.classification,
          payTrailerNumber: input.trailerNumber,
        },
      });
      await tx.payContainerContainer.create({
        data: {
          payContainerId: payContainer.id,
          containerId: container.id,
          containerNo: container.containerNo,
        },
      });
      await tx.correctionFeedback.create({
        data: {
          targetType: CorrectionTargetType.CONTAINER,
          containerId: container.id,
          fieldName: input.fieldName,
          oldValue: this.nullableJsonValue({
            payClassification: container.payClassification,
            payTrailerNumber: container.payTrailerNumber,
            existingPayContainerIds: existingLinks
              .filter((link) => link.containerId === container.id)
              .map((link) => link.payContainerId),
          }),
          newValue: this.nullableJsonValue({
            payClassification: input.classification,
            payTrailerNumber: input.trailerNumber,
            payContainerId: payContainer.id,
            payContainerNo,
            associatedContainerNos: input.containers.map(
              (item) => item.containerNo,
            ),
          }),
          reason: input.reason,
          note: input.note,
          correctedById: input.correctedById,
        },
      });
    }

    await tx.correctionFeedback.create({
      data: {
        targetType: CorrectionTargetType.PAY_CONTAINER,
        payContainerId: payContainer.id,
        fieldName: input.fieldName,
        oldValue: this.nullableJsonValue({
          payContainerId: targetPayContainer?.id ?? null,
          sourceContainers: existingLinks.map((link) => ({
            containerId: link.containerId,
            containerNo: link.containerNo,
            payContainerId: link.payContainerId,
          })),
        }),
        newValue: this.nullableJsonValue({
          payContainerNo,
          classification: input.classification,
          trailerNumber: input.trailerNumber,
          sourceContainers: input.containers.map((container) => ({
            containerId: container.id,
            containerNo: container.containerNo,
          })),
        }),
        reason: input.reason,
        note: input.note,
        correctedById: input.correctedById,
      },
    });
  }

  private async getContainerUnloadingWage(
    containerId: string,
  ): Promise<ContainerUnloadingWageResponseDto> {
    const record = (await this.prisma.container.findUnique({
      where: { id: containerId },
      include: {
        payContainerLinks: {
          include: {
            payContainer: {
              include: {
                sourceContainers: { orderBy: { containerNo: 'asc' } },
                unloaders: { orderBy: { workerName: 'asc' } },
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    })) as ContainerUnloadingWageRecord | null;

    if (!record) {
      throw new NotFoundException({
        code: 'CONTAINER_NOT_FOUND',
        message: `Container ${containerId} was not found.`,
        details: { id: containerId },
      });
    }

    return this.toContainerUnloadingWageResponse(record);
  }

  private async findPayContainerForContainerOrThrow(
    containerId: string,
  ): Promise<PayContainerRecord> {
    const link = (await this.prisma.payContainerContainer.findFirst({
      where: { containerId },
      include: {
        payContainer: {
          include: {
            sourceContainers: { orderBy: { containerNo: 'asc' } },
            unloaders: { orderBy: { workerName: 'asc' } },
          },
        },
      },
    })) as ExistingPayContainerLinkRecord | null;

    if (!link) {
      throw new BadRequestException({
        code: 'CONTAINER_UNLOADING_WAGE_NOT_CONFIGURED',
        message:
          'Container unloading wage information must be saved before this action.',
        details: { containerId },
      });
    }

    return link.payContainer;
  }

  private async findAssociatedContainersOrThrow(
    associatedContainerIds: string[],
    associatedContainerNos: string[],
  ): Promise<ContainerRecord[]> {
    const ids = [
      ...new Set(associatedContainerIds.map((id) => id.trim())),
    ].filter(Boolean);
    const containerNos = [
      ...new Set(
        associatedContainerNos.map((containerNo) => containerNo.trim()),
      ),
    ].filter(Boolean);
    if (ids.length === 0 && containerNos.length === 0) {
      return [];
    }

    const records = (await this.prisma.container.findMany({
      where: {
        OR: [
          ...(ids.length > 0 ? [{ id: { in: ids } }] : []),
          ...(containerNos.length > 0
            ? [{ containerNo: { in: containerNos } }]
            : []),
        ],
      },
      orderBy: { containerNo: 'asc' },
    })) as ContainerRecord[];
    const foundIds = new Set(records.map((record) => record.id));
    const foundNos = new Set(records.map((record) => record.containerNo));
    const missingIds = ids.filter((id) => !foundIds.has(id));
    const missingNos = containerNos.filter(
      (containerNo) => !foundNos.has(containerNo),
    );

    if (missingIds.length > 0 || missingNos.length > 0) {
      throw new NotFoundException({
        code: 'ASSOCIATED_CONTAINER_NOT_FOUND',
        message: 'One or more associated containers were not found.',
        details: { missingIds, missingContainerNos: missingNos },
      });
    }

    return records;
  }

  private uniqueContainers(containers: ContainerRecord[]): ContainerRecord[] {
    const byId = new Map<string, ContainerRecord>();
    for (const container of containers) {
      if (!byId.has(container.id)) {
        byId.set(container.id, container);
      }
    }
    return [...byId.values()];
  }

  private async containerUnloaderInputs(
    unloaders: ContainerUnloaderDto[],
  ): Promise<
    Array<{
      unloadingWorkerId: string;
      workerUserId: string | null;
      workerCode: string;
      workerName: string;
      note: string | null;
    }>
  > {
    const requested = unloaders.map((unloader, index) => {
      const unloadingWorkerId = this.stringOrNull(unloader.unloadingWorkerId);
      if (!unloadingWorkerId) {
        throw new BadRequestException({
          code: 'UNLOADING_WORKER_REQUIRED',
          message:
            'Each container detail unloader must be selected from the temporary unloading worker directory.',
          details: {
            index,
            workerUserId: this.stringOrNull(unloader.workerUserId),
            workerName: this.stringOrNull(unloader.workerName),
          },
        });
      }

      return {
        index,
        note: this.stringOrNull(unloader.note),
        unloadingWorkerId,
      };
    });

    const seenWorkerIds = new Set<string>();
    for (const unloader of requested) {
      if (seenWorkerIds.has(unloader.unloadingWorkerId)) {
        throw new BadRequestException({
          code: 'DUPLICATE_UNLOADER_ASSIGNMENT',
          message: `Duplicate unloader assignment: ${unloader.unloadingWorkerId}.`,
          details: { unloadingWorkerId: unloader.unloadingWorkerId },
        });
      }
      seenWorkerIds.add(unloader.unloadingWorkerId);
    }

    const workers = (await this.prisma.unloadingWorker.findMany({
      where: { id: { in: [...seenWorkerIds] } },
    })) as UnloadingWorkerRecord[];
    const workersById = new Map(workers.map((worker) => [worker.id, worker]));

    return requested.map((unloader) => {
      const worker = workersById.get(unloader.unloadingWorkerId);
      if (!worker) {
        throw new BadRequestException({
          code: 'UNLOADING_WORKER_NOT_FOUND',
          message: 'Selected unloading worker was not found.',
          details: { unloadingWorkerId: unloader.unloadingWorkerId },
        });
      }

      if (!worker.isActive) {
        throw new BadRequestException({
          code: 'UNLOADING_WORKER_INACTIVE',
          message: 'Selected unloading worker is inactive.',
          details: { unloadingWorkerId: worker.id },
        });
      }

      return {
        unloadingWorkerId: worker.id,
        note: unloader.note,
        workerCode: worker.workerCode,
        workerName: worker.displayName,
        workerUserId: null,
      };
    });
  }

  private toWorkerResponse(
    worker: UnloadingWorkerRecord,
  ): UnloadingWageWorkerResponseDto {
    return {
      createdAt: this.iso(worker.createdAt),
      createdById: worker.createdById,
      displayName: worker.displayName,
      email: null,
      id: worker.id,
      isActive: worker.isActive,
      note: worker.note,
      phone: worker.phone,
      roles: [],
      updatedAt: this.iso(worker.updatedAt),
      updatedById: worker.updatedById,
      workerCode: worker.workerCode,
    };
  }

  private async generatedTemporaryWorkerCode(): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const candidate = `TEMP-${randomUUID().slice(0, 8).toUpperCase()}`;
      const existing = (await this.prisma.unloadingWorker.findUnique({
        where: { workerCode: candidate },
      })) as UnloadingWorkerRecord | null;
      if (!existing) {
        return candidate;
      }
    }

    throw new InternalServerErrorException({
      code: 'UNLOADING_WORKER_CODE_GENERATION_FAILED',
      message: 'Unable to generate a unique temporary unloading worker code.',
      details: {},
    });
  }

  private async assertWorkerCodeAvailable(
    workerCode: string,
    currentWorkerId?: string,
  ): Promise<void> {
    const existing = (await this.prisma.unloadingWorker.findUnique({
      where: { workerCode },
    })) as UnloadingWorkerRecord | null;
    if (existing && existing.id !== currentWorkerId) {
      throw new BadRequestException({
        code: 'UNLOADING_WORKER_CODE_DUPLICATE',
        message: `Unloading worker code already exists: ${workerCode}.`,
        details: { workerCode },
      });
    }
  }

  private async markRelatedSettlementsNeedReview(
    tx: UnloadingWageTransaction,
    payContainerIds: string[],
  ): Promise<void> {
    const uniqueIds = [...new Set(payContainerIds)].filter(Boolean);
    if (uniqueIds.length === 0) {
      return;
    }
    await tx.unloadingWageSettlement.updateMany({
      where: {
        status: UnloadingWageSettlementStatus.GENERATED,
        lines: { some: { payContainerId: { in: uniqueIds } } },
      },
      data: { status: UnloadingWageSettlementStatus.NEEDS_REVIEW },
    });
  }

  private settlementInputs(
    payContainers: PayContainerRecord[],
    warnings: SettlementIssue[],
    errors: SettlementIssue[],
  ): SettlementInput[] {
    const inputs: SettlementInput[] = [];
    for (const payContainer of payContainers) {
      const containerNumbers =
        payContainer.sourceContainers?.map(
          (container) => container.containerNo,
        ) ?? [];
      const unloaders = payContainer.unloaders ?? [];
      if (!payContainer.completedAt || unloaders.length === 0) {
        errors.push({
          code: 'PAY_CONTAINER_NOT_COMPLETE',
          message: 'Pay container requires completedAt and unloaders.',
          payContainerId: payContainer.id,
          payContainerNo: payContainer.payContainerNo,
        });
        continue;
      }
      const allocations = this.allocations(payContainer, unloaders, errors);
      if (allocations.length === 0) {
        continue;
      }
      inputs.push({ payContainer, containerNumbers, allocations });
      if (payContainer.allocationMethod !== PayAllocationMethod.EQUAL_SPLIT) {
        warnings.push({
          code: 'MANUAL_ALLOCATION_REQUIRES_AUDIT_REVIEW',
          message: 'Manual allocation was snapshotted for audit review.',
          payContainerId: payContainer.id,
          payContainerNo: payContainer.payContainerNo,
        });
      }
    }
    return inputs;
  }

  private allocations(
    payContainer: PayContainerRecord,
    unloaders: UnloaderAssignmentRecord[],
    errors: SettlementIssue[],
  ): SettlementAllocation[] {
    const rateCents = this.moneyCents(payContainer.rateAmount);
    if (payContainer.allocationMethod === PayAllocationMethod.MANUAL_AMOUNT) {
      const allocated = unloaders.reduce(
        (total, unloader) => total + this.moneyCents(unloader.allocationAmount),
        0,
      );
      if (allocated !== rateCents) {
        errors.push({
          code: 'MANUAL_ALLOCATION_TOTAL_MISMATCH',
          message: 'Manual allocation total must equal pay container rate.',
          payContainerId: payContainer.id,
          payContainerNo: payContainer.payContainerNo,
        });
        return [];
      }
      return unloaders.map((unloader) => ({
        workerCode: unloader.workerCode,
        workerName: unloader.workerName,
        amountCents: this.moneyCents(unloader.allocationAmount),
      }));
    }

    if (payContainer.allocationMethod === PayAllocationMethod.MANUAL_PERCENT) {
      const totalPercent = unloaders.reduce(
        (total, unloader) =>
          total + this.numberValue(unloader.allocationPercent),
        0,
      );
      if (Math.round(totalPercent * 10000) !== 1_000_000) {
        errors.push({
          code: 'MANUAL_PERCENT_TOTAL_MISMATCH',
          message: 'Manual allocation percent total must equal 100.',
          payContainerId: payContainer.id,
          payContainerNo: payContainer.payContainerNo,
        });
        return [];
      }
      return this.percentAllocations(unloaders, rateCents);
    }

    return this.equalAllocations(unloaders, rateCents);
  }

  private equalAllocations(
    unloaders: UnloaderAssignmentRecord[],
    rateCents: number,
  ): SettlementAllocation[] {
    const base = Math.floor(rateCents / unloaders.length);
    const remainder = rateCents % unloaders.length;
    return unloaders.map((unloader, index) => ({
      workerCode: unloader.workerCode,
      workerName: unloader.workerName,
      amountCents: base + (index < remainder ? 1 : 0),
    }));
  }

  private percentAllocations(
    unloaders: UnloaderAssignmentRecord[],
    rateCents: number,
  ): SettlementAllocation[] {
    let remaining = rateCents;
    return unloaders.map((unloader, index) => {
      const isLast = index === unloaders.length - 1;
      const amountCents = isLast
        ? remaining
        : Math.round(
            (rateCents * this.numberValue(unloader.allocationPercent)) / 100,
          );
      remaining -= amountCents;
      return {
        workerCode: unloader.workerCode,
        workerName: unloader.workerName,
        amountCents,
      };
    });
  }

  private workerTotals(inputs: SettlementInput[]): Map<
    string,
    {
      workerCode: string;
      workerName: string;
      payContainerCount: number;
      totalCents: number;
    }
  > {
    const totals = new Map<
      string,
      {
        workerCode: string;
        workerName: string;
        payContainerCount: number;
        totalCents: number;
      }
    >();
    for (const input of inputs) {
      for (const allocation of input.allocations) {
        const existing = totals.get(allocation.workerCode) ?? {
          workerCode: allocation.workerCode,
          workerName: allocation.workerName,
          payContainerCount: 0,
          totalCents: 0,
        };
        existing.payContainerCount += 1;
        existing.totalCents += allocation.amountCents;
        totals.set(allocation.workerCode, existing);
      }
    }
    return totals;
  }

  private settlementInputSnapshot(
    input: SettlementInput,
  ): Record<string, unknown> {
    return {
      payContainerId: input.payContainer.id,
      payContainerNo: input.payContainer.payContainerNo,
      classification: input.payContainer.classification,
      trailerNumber: input.payContainer.trailerNumber,
      containerNumbers: input.containerNumbers,
      completedAt: this.iso(
        this.dateTimeRequired(input.payContainer.completedAt),
      ),
      rateAmount: this.moneyString(input.payContainer.rateAmount),
      allocationMethod: input.payContainer.allocationMethod,
      unloaders:
        input.payContainer.unloaders?.map((unloader) => ({
          unloadingWorkerId: unloader.unloadingWorkerId ?? null,
          workerUserId: unloader.workerUserId,
          workerCode: unloader.workerCode,
          workerName: unloader.workerName,
          allocationAmount:
            unloader.allocationAmount === null ||
            unloader.allocationAmount === undefined
              ? null
              : this.moneyString(unloader.allocationAmount),
          allocationPercent:
            unloader.allocationPercent === null ||
            unloader.allocationPercent === undefined
              ? null
              : this.percentString(unloader.allocationPercent),
          note: unloader.note,
        })) ?? [],
      allocations: input.allocations.map((allocation) => ({
        workerCode: allocation.workerCode,
        workerName: allocation.workerName,
        amount: this.moneyString(allocation.amountCents / 100),
      })),
    };
  }

  private async writeSettlementArtifacts(
    settlement: SettlementRecord,
    warnings: SettlementIssue[],
    errors: SettlementIssue[],
    generatedById: string | null,
  ): Promise<void> {
    const dir = join(
      this.storageRoot,
      'unloading_wage_settlements',
      settlement.settlementMonth,
      settlement.id,
    );
    await mkdir(dir, { recursive: true });
    const jsonPath = join(dir, 'settlement.json');
    const htmlPath = join(dir, 'settlement-report.html');
    const payload = this.toSettlementResponse(settlement);
    payload.warnings = warnings;
    payload.errors = errors;
    await writeFile(jsonPath, JSON.stringify(payload, null, 2) + '\n', 'utf8');
    await writeFile(htmlPath, this.settlementHtml(payload), 'utf8');
    await this.prisma.wageGeneratedFile.create({
      data: {
        unloadingWageSettlementId: settlement.id,
        fileType: WageGeneratedFileType.UNLOADING_WAGE_SETTLEMENT_JSON,
        storagePath: jsonPath,
        fileSha256: await this.fileSha256(jsonPath),
        mimeType: 'application/json',
        fileSizeBytes: await this.fileSize(jsonPath),
        status: GeneratedFileStatus.GENERATED,
        generatedById,
      },
    });
    await this.prisma.wageGeneratedFile.create({
      data: {
        unloadingWageSettlementId: settlement.id,
        fileType: WageGeneratedFileType.UNLOADING_WAGE_TASK_REPORT_HTML,
        storagePath: htmlPath,
        fileSha256: await this.fileSha256(htmlPath),
        mimeType: 'text/html',
        fileSizeBytes: await this.fileSize(htmlPath),
        status: GeneratedFileStatus.GENERATED,
        generatedById,
      },
    });
  }

  private settlementHtml(payload: UnloadingWageSettlementResponseDto): string {
    const workerRows = payload.workers
      .map(
        (worker) =>
          `<tr><td>${this.escapeHtml(worker.workerCode)}</td><td>${this.escapeHtml(
            worker.workerName,
          )}</td><td>${worker.payContainerCount}</td><td>${worker.totalAmount}</td></tr>`,
      )
      .join('');
    const detailRows = payload.lines
      .map(
        (line) =>
          `<tr><td>${this.escapeHtml(line.payContainerNo)}</td><td>${this.escapeHtml(
            line.classification,
          )}</td><td>${this.escapeHtml(line.trailerNumber ?? '')}</td><td>${this.escapeHtml(
            this.containerNumbersText(line.containerNumbers),
          )}</td><td>${this.escapeHtml(line.completedAt)}</td><td>${this.escapeHtml(
            line.rateAmount,
          )}</td><td>${this.escapeHtml(line.workerName)}</td><td>${this.escapeHtml(
            line.amount,
          )}</td></tr>`,
      )
      .join('');
    return `<!doctype html><html><head><meta charset="utf-8"><title>Unloading Wage Settlement</title></head><body><h1>Unloading Wage Settlement ${this.escapeHtml(
      payload.settlementMonth,
    )}</h1><p>Total: ${this.escapeHtml(payload.currency)} ${this.escapeHtml(
      payload.totalAmount,
    )}</p><h2>Worker Summary</h2><table><thead><tr><th>Worker</th><th>Name</th><th>Pay units</th><th>Total</th></tr></thead><tbody>${workerRows}</tbody></table><h2>Detail Lines</h2><table><thead><tr><th>Pay unit</th><th>Classification</th><th>Trailer</th><th>Containers</th><th>Completed at</th><th>Rate</th><th>Worker</th><th>Worker amount</th></tr></thead><tbody>${detailRows}</tbody></table></body></html>`;
  }

  private async findContainerOrThrow(id: string): Promise<ContainerRecord> {
    const record = (await this.prisma.container.findUnique({
      where: { id },
    })) as ContainerRecord | null;
    if (!record) {
      throw new NotFoundException({
        code: 'CONTAINER_NOT_FOUND',
        message: `Container ${id} was not found.`,
        details: { id },
      });
    }
    return record;
  }

  private async findContainersOrThrow(
    ids: string[],
  ): Promise<ContainerRecord[]> {
    const uniqueIds = [...new Set(ids)];
    const records = (await this.prisma.container.findMany({
      where: { id: { in: uniqueIds } },
      orderBy: { containerNo: 'asc' },
    })) as ContainerRecord[];
    if (records.length !== uniqueIds.length) {
      throw new NotFoundException({
        code: 'CONTAINER_NOT_FOUND',
        message: 'One or more containers were not found.',
        details: {
          requestedIds: uniqueIds,
          foundIds: records.map((record) => record.id),
        },
      });
    }
    return records;
  }

  private async findPayContainerOrThrow(
    id: string,
  ): Promise<PayContainerRecord> {
    const record = (await this.prisma.payContainer.findUnique({
      where: { id },
      include: {
        sourceContainers: { orderBy: { containerNo: 'asc' } },
        unloaders: { orderBy: { workerCode: 'asc' } },
      },
    })) as PayContainerRecord | null;
    if (!record) {
      throw new NotFoundException({
        code: 'PAY_CONTAINER_NOT_FOUND',
        message: `Pay container ${id} was not found.`,
        details: { id },
      });
    }
    return record;
  }

  private async findSettlementOrThrow(id: string): Promise<SettlementRecord> {
    const record = (await this.prisma.unloadingWageSettlement.findUnique({
      where: { id },
      include: {
        workerSummaries: { orderBy: { workerCode: 'asc' } },
        lines: { orderBy: [{ workerCode: 'asc' }, { payContainerNo: 'asc' }] },
        generatedFiles: true,
      },
    })) as SettlementRecord | null;
    if (!record) {
      throw new NotFoundException({
        code: 'UNLOADING_WAGE_SETTLEMENT_NOT_FOUND',
        message: `Unloading wage settlement ${id} was not found.`,
        details: { id },
      });
    }
    return record;
  }

  private async rateForClassification(
    classification: ClassificationValue,
  ): Promise<number> {
    const key =
      classification === ContainerPayClassification.OCEAN_CONTAINER
        ? 'unloadingWageOceanContainerRateCad'
        : 'unloadingWageUsToCanadaTransferRateCad';
    const setting = await this.prisma.operationalSetting.findUnique({
      where: { key },
    });
    const configured = this.numberValue(setting?.value);
    if (configured > 0) {
      return configured;
    }
    return classification === ContainerPayClassification.OCEAN_CONTAINER
      ? 300
      : 360;
  }

  private validateUnloaderAssignments(
    payContainer: PayContainerRecord,
    allocationMethod: AllocationMethodValue,
    unloaders: CompleteUnloadingDto['unloaders'],
  ): void {
    const seen = new Set<string>();
    for (const unloader of unloaders) {
      const workerCode = this.requiredString(unloader.workerCode, 'workerCode');
      if (seen.has(workerCode)) {
        throw new BadRequestException({
          code: 'DUPLICATE_UNLOADER_ASSIGNMENT',
          message: `Duplicate unloader assignment: ${workerCode}.`,
          details: { workerCode },
        });
      }
      seen.add(workerCode);
    }
    if (allocationMethod === PayAllocationMethod.MANUAL_AMOUNT) {
      const total = unloaders.reduce(
        (sum, unloader) => sum + this.moneyCents(unloader.allocationAmount),
        0,
      );
      if (total !== this.moneyCents(payContainer.rateAmount)) {
        throw new BadRequestException({
          code: 'MANUAL_ALLOCATION_TOTAL_MISMATCH',
          message: 'Manual allocation total must equal pay container rate.',
          details: { payContainerId: payContainer.id },
        });
      }
    }
  }

  private assertCanComplete(payContainer: PayContainerRecord): void {
    if (payContainer.status === PayContainerStatus.SETTLED) {
      throw new BadRequestException({
        code: 'PAY_CONTAINER_ALREADY_SETTLED',
        message: 'A settled pay container cannot be completed again.',
        details: { payContainerId: payContainer.id },
      });
    }
  }

  private assertContainerCount(
    classification: ClassificationValue,
    containerIds: string[],
  ): void {
    if (
      classification === ContainerPayClassification.OCEAN_CONTAINER &&
      containerIds.length !== 1
    ) {
      throw new BadRequestException({
        code: 'OCEAN_PAY_CONTAINER_REQUIRES_ONE_CONTAINER',
        message:
          'OCEAN_CONTAINER pay containers must contain exactly one container.',
        details: { containerIds },
      });
    }
  }

  private classification(value: string): ClassificationValue {
    if (
      value === ContainerPayClassification.OCEAN_CONTAINER ||
      value === ContainerPayClassification.US_TO_CANADA_TRANSFER
    ) {
      return value;
    }
    throw new BadRequestException({
      code: 'INVALID_PAY_CLASSIFICATION',
      message: `Unsupported pay classification: ${value}`,
      details: { classification: value },
    });
  }

  private allocationMethod(value: string): AllocationMethodValue {
    if (
      value === PayAllocationMethod.EQUAL_SPLIT ||
      value === PayAllocationMethod.MANUAL_AMOUNT ||
      value === PayAllocationMethod.MANUAL_PERCENT
    ) {
      return value;
    }
    throw new BadRequestException({
      code: 'INVALID_ALLOCATION_METHOD',
      message: `Unsupported allocation method: ${value}`,
      details: { allocationMethod: value },
    });
  }

  private payContainerStatus(value: string): PayContainerStatus {
    if (
      value === PayContainerStatus.DRAFT ||
      value === PayContainerStatus.COMPLETED ||
      value === PayContainerStatus.SETTLED ||
      value === PayContainerStatus.NEEDS_REVIEW
    ) {
      return value;
    }
    throw new BadRequestException({
      code: 'INVALID_PAY_CONTAINER_STATUS',
      message: `Unsupported pay container status: ${value}`,
      details: { status: value },
    });
  }

  private trailerNumberOrNull(
    classification: ClassificationValue,
    value: string | null | undefined,
  ): string | null {
    const trailerNumber = this.stringOrNull(value);
    if (
      classification === ContainerPayClassification.US_TO_CANADA_TRANSFER &&
      !trailerNumber
    ) {
      throw new BadRequestException({
        code: 'MISSING_TRAILER_NUMBER',
        message: 'US_TO_CANADA_TRANSFER pay containers require trailerNumber.',
        details: {},
      });
    }
    return trailerNumber;
  }

  private payContainerNo(
    classification: ClassificationValue,
    key: string,
  ): string {
    const safeKey = key.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-|-$/g, '');
    return classification === ContainerPayClassification.US_TO_CANADA_TRANSFER
      ? `PC-TRAILER-${safeKey}`
      : `PC-OCEAN-${safeKey}`;
  }

  private monthRange(settlementMonth: string): { gte: Date; lt: Date } {
    const [yearText, monthText] = settlementMonth.split('-');
    const year = Number(yearText);
    const month = Number(monthText);
    return {
      gte: new Date(Date.UTC(year, month - 1, 1)),
      lt: new Date(Date.UTC(year, month, 1)),
    };
  }

  private dateTime(value: string, field: string): Date {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException({
        code: 'INVALID_DATETIME',
        message: `${field} must be a valid ISO datetime.`,
        details: { field, value },
      });
    }
    return date;
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

  private requiredString(value: unknown, field: string): string {
    const text = this.stringOrNull(value);
    if (!text) {
      throw new BadRequestException({
        code: 'REQUIRED_FIELD_MISSING',
        message: `${field} is required.`,
        details: { field },
      });
    }
    return text;
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

  private moneyString(value: unknown): string {
    return (this.moneyCents(value) / 100).toFixed(2);
  }

  private percentString(value: unknown): string {
    return this.numberValue(value).toFixed(4);
  }

  private moneyCents(value: unknown): number {
    const number = this.numberValue(value);
    return Math.round(number * 100);
  }

  private numberValue(value: unknown): number {
    if (value === null || value === undefined) {
      return 0;
    }
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }

  private nullableJsonValue(
    value: unknown,
  ): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput {
    if (value === undefined || value === null) {
      return Prisma?.JsonNull ?? null;
    }
    const serialized = JSON.stringify(value);
    if (serialized === undefined || serialized === 'null') {
      return Prisma?.JsonNull ?? null;
    }
    return JSON.parse(serialized) as Prisma.InputJsonValue;
  }

  private jsonValue(value: unknown): Prisma.InputJsonValue {
    const serialized = JSON.stringify(value === undefined ? {} : value);
    if (serialized === undefined || serialized === 'null') {
      return {};
    }
    return JSON.parse(serialized) as Prisma.InputJsonValue;
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

  private async downloadWageGeneratedFile(
    record: WageGeneratedFileRecord,
    details: Record<string, string>,
  ): Promise<WageGeneratedFileDownload> {
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
        mimeType: record.mimeType ?? 'application/octet-stream',
      };
    } catch (error) {
      throw new InternalServerErrorException({
        code: 'WAGE_GENERATED_FILE_STORAGE_MISSING',
        message:
          'The generated wage file record exists, but the file cannot be read.',
        details: {
          ...details,
          storagePath: record.storagePath,
          errorMessage: this.errorMessage(error),
        },
      });
    }
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
      code: 'WAGE_GENERATED_FILE_STORAGE_PATH_INVALID',
      message: 'Generated wage file storage path is outside storage root.',
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

  private containerNumbersText(value: unknown): string {
    if (Array.isArray(value)) {
      return value.map((item) => String(item)).join(', ');
    }
    if (value === null || value === undefined) {
      return '';
    }
    return typeof value === 'string' ? value : JSON.stringify(value);
  }

  private toPayContainerResponse(
    record: PayContainerRecord,
  ): PayContainerResponseDto {
    return {
      id: record.id,
      payContainerNo: record.payContainerNo,
      classification: record.classification,
      trailerNumber: record.trailerNumber,
      status: record.status,
      currency: record.currency,
      rateAmount: record.rateAmount.toString(),
      allocationMethod: record.allocationMethod,
      completedAt: this.isoOrNull(record.completedAt),
      completedById: record.completedById,
      completionNote: record.completionNote,
      containers:
        record.sourceContainers?.map((container) => ({
          id: container.id,
          containerId: container.containerId,
          containerNo: container.containerNo,
        })) ?? [],
      unloaders:
        record.unloaders?.map((unloader) => ({
          id: unloader.id,
          unloadingWorkerId: unloader.unloadingWorkerId ?? null,
          workerUserId: unloader.workerUserId,
          workerCode: unloader.workerCode,
          workerName: unloader.workerName,
          allocationAmount: unloader.allocationAmount?.toString() ?? null,
          allocationPercent: unloader.allocationPercent?.toString() ?? null,
          note: unloader.note,
        })) ?? [],
      createdAt: this.iso(record.createdAt),
      updatedAt: this.iso(record.updatedAt),
    };
  }

  private toContainerUnloadingWageResponse(
    record: ContainerUnloadingWageRecord,
  ): ContainerUnloadingWageResponseDto {
    const payContainer = record.payContainerLinks?.[0]?.payContainer ?? null;
    if (!payContainer) {
      return {
        containerId: record.id,
        containerNo: record.containerNo,
        classification: record.payClassification,
        trailerNumber: record.payTrailerNumber,
        payContainerId: null,
        payContainerNo: null,
        status: null,
        currency: null,
        rateAmount: null,
        completedAt: null,
        completedById: null,
        completionNote: null,
        associatedContainers: [],
        unloaders: [],
      };
    }

    return {
      containerId: record.id,
      containerNo: record.containerNo,
      classification: payContainer.classification,
      trailerNumber: payContainer.trailerNumber,
      payContainerId: payContainer.id,
      payContainerNo: payContainer.payContainerNo,
      status: payContainer.status,
      currency: payContainer.currency,
      rateAmount: payContainer.rateAmount.toString(),
      completedAt: this.isoOrNull(payContainer.completedAt),
      completedById: payContainer.completedById,
      completionNote: payContainer.completionNote,
      associatedContainers:
        payContainer.sourceContainers?.map((container) => ({
          id: container.id,
          containerId: container.containerId,
          containerNo: container.containerNo,
        })) ?? [],
      unloaders:
        payContainer.unloaders?.map((unloader) => ({
          id: unloader.id,
          unloadingWorkerId: unloader.unloadingWorkerId ?? null,
          workerUserId: unloader.workerUserId,
          workerCode: unloader.workerCode,
          workerName: unloader.workerName,
          note: unloader.note,
        })) ?? [],
    };
  }

  private toSettlementResponse(
    record: SettlementRecord,
  ): UnloadingWageSettlementResponseDto {
    const raw = record.rawJson as {
      warnings?: unknown[];
      errors?: unknown[];
    } | null;
    return {
      id: record.id,
      settlementMonth: record.settlementMonth,
      currency: record.currency,
      status: record.status,
      totalAmount: record.totalAmount.toString(),
      warningCount: record.warningCount,
      errorCount: record.errorCount,
      workers:
        record.workerSummaries?.map((worker) => ({
          id: worker.id,
          workerCode: worker.workerCode,
          workerName: worker.workerName,
          payContainerCount: worker.payContainerCount,
          totalAmount: worker.totalAmount.toString(),
        })) ?? [],
      lines:
        record.lines?.map((line) => ({
          id: line.id,
          workerCode: line.workerCode,
          workerName: line.workerName,
          payContainerNo: line.payContainerNo,
          classification: line.classification,
          trailerNumber: line.trailerNumber,
          containerNumbers: line.containerNumbers,
          completedAt: this.iso(line.completedAt),
          rateAmount: line.rateAmount.toString(),
          allocationMethod: line.allocationMethod,
          amount: line.amount.toString(),
        })) ?? [],
      generatedFiles:
        record.generatedFiles?.map((file) => ({
          id: file.id,
          fileType: file.fileType,
          storagePath: file.storagePath,
          fileSha256: file.fileSha256,
          status: file.status,
        })) ?? [],
      warnings: Array.isArray(raw?.warnings) ? raw.warnings : [],
      errors: Array.isArray(raw?.errors) ? raw.errors : [],
      createdAt: this.iso(record.createdAt),
      updatedAt: this.iso(record.updatedAt),
    };
  }

  private isoOrNull(value: Date | string | null): string | null {
    return value ? this.iso(value) : null;
  }

  private iso(value: Date | string): string {
    return value instanceof Date
      ? value.toISOString()
      : new Date(value).toISOString();
  }

  private escapeHtml(value: string): string {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
