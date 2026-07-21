import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateCorrectionDto } from './dto/create-correction.dto';
import {
  CreateManualContainerDestinationDto,
  CreateManualContainerDto,
} from './dto/create-manual-container.dto';
import { ListCorrectionsQueryDto } from './dto/list-corrections-query.dto';
import {
  ContainerCorrectionResponseDto,
  ContainerDetailResponseDto,
  ContainerDestinationCorrectionResponseDto,
  CorrectionFeedbackResponseDto,
  CorrectionListResponseDto,
  ManualContainerResponseDto,
} from './dto/correction-response.dto';
import { CreateContainerDestinationDto } from './dto/create-container-destination.dto';
import { UpdateContainerDestinationDto } from './dto/update-container-destination.dto';
import { UpdateContainerDto } from './dto/update-container.dto';
import {
  ContainerStatus,
  CorrectionTargetType,
  FileFormat,
  ParserProfileAuditEventCode,
  ParserProfileTrustState,
  ParserSourceKind,
} from '../generated/prisma/enums';
import {
  effectiveContainerStatus,
  isContainerGenerationLocked,
} from '../common/container-lifecycle';
import {
  lockContainerDestinationRows,
  lockContainerRow,
} from '../common/container-pallet-lock';
import { auditUserId } from '../auth/audit-user';
import { AuthenticatedUser } from '../auth/auth-user';
import { Prisma } from '../generated/prisma/client';
import { ContainerPalletInventorySyncService } from '../pallet-inventory-sync/container-pallet-inventory-sync.service';
import { PrismaService } from '../prisma/prisma.service';
import { PalletPolicyResolver } from '../settings/pallet-policy.resolver';
import { ParserLearningCasesService } from '../parser-learning-cases/parser-learning-cases.service';
import {
  calculateDestinationPallets,
  type DestinationPalletCalculationResult,
} from '../pallet-calculation/pallet-calculation';

type CorrectionTargetTypeValue =
  (typeof CorrectionTargetType)[keyof typeof CorrectionTargetType];
type NullableJsonInput =
  | Prisma.InputJsonValue
  | Prisma.NullableJsonNullValueInput;

interface Change {
  fieldName: string;
  oldValue: unknown;
  newValue: unknown;
}

interface ContainerRecord {
  id: string;
  importFileId: string | null;
  containerNo: string;
  dockNo: string | null;
  company: string | null;
  sourceFormat?: string;
  parserVersion?: string | null;
  parserSourceKind?: string;
  parserProfileVersionId?: string | null;
  status: string;
  payClassification?: string | null;
  payTrailerNumber?: string | null;
  payContainerLinks?: Array<{
    id: string;
    payContainerId: string;
    payContainer: {
      id?: string;
      payContainerNo: string;
      classification?: string;
      trailerNumber?: string | null;
      status: string;
      currency?: string;
      rateAmount?: { toString(): string } | number | string;
      completedAt?: Date | string | null;
      completedById?: string | null;
      completionNote?: string | null;
      sourceContainers?: Array<{
        id: string;
        containerId: string;
        containerNo: string;
      }>;
      unloaders?: Array<{
        id: string;
        unloadingWorkerId: string | null;
        workerUserId: string | null;
        workerCode: string;
        workerName: string;
        note: string | null;
      }>;
    };
  }>;
  rawJson?: unknown;
  warnings?: unknown;
  errors?: unknown;
  destinations?: ContainerDestinationRecord[];
  createdAt?: Date | string;
  updatedAt: Date | string;
}

interface ContainerDestinationRecord {
  id: string;
  containerId: string;
  destinationCode: string;
  destinationType: string | null;
  packageType?: string | null;
  cartons: number;
  volume: { toString(): string } | number | string;
  calculatedPallets: number;
  manualPallets: number | null;
  finalPallets: number;
  palletRuleCode?: string | null;
  calculationBasisCbm?: { toString(): string } | number | string | null;
  roundingMode?: string | null;
  palletPolicySnapshot?: unknown;
  note: string | null;
  warnings?: unknown;
  errors?: unknown;
  pallets?: Array<{
    status: string;
    loadJobId: string | null;
    loadedAt: Date | string | null;
  }>;
  container?: {
    destinations?: ContainerDestinationRecord[];
    status: string;
  } | null;
  createdAt?: Date | string;
  updatedAt: Date | string;
}

interface CorrectionFeedbackRecord {
  id: string;
  targetType: string;
  importFileId: string | null;
  containerId: string | null;
  containerLineId: string | null;
  containerDestinationId: string | null;
  palletId: string | null;
  generatedFileId: string | null;
  attendanceImportId: string | null;
  payContainerId: string | null;
  unloadingWageSettlementId: string | null;
  fieldName: string;
  oldValue: unknown;
  newValue: unknown;
  reason: string | null;
  note: string | null;
  correctedById: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

const TARGET_ID_FIELDS = [
  'importFileId',
  'containerId',
  'containerLineId',
  'containerDestinationId',
  'palletId',
  'generatedFileId',
  'attendanceImportId',
  'payContainerId',
  'unloadingWageSettlementId',
] as const;

type PackageTypeForStorage = 'CARTON' | 'WOODEN_CRATE';

type DestinationPalletRuleResult = DestinationPalletCalculationResult & {
  storedPackageType: PackageTypeForStorage;
};

const PALLET_RECALC_WARNING_CODES = new Set([
  'MISSING_DESTINATION',
  'NEED_CONFIRM_DESTINATION_TYPE',
  'PACKAGE_TYPE_CONFIRMATION_REQUIRED',
  'ZERO_VOLUME_WITH_CARTONS',
  'WOODEN_CRATE_PIECE_COUNT_REQUIRED',
  'OVERSIZE_PIECE_COUNT_REQUIRED',
]);

@Injectable()
export class CorrectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly palletInventorySync: ContainerPalletInventorySyncService,
    private readonly palletPolicyResolver: PalletPolicyResolver,
    private readonly parserLearningCases: ParserLearningCasesService,
  ) {}

  async getContainer(id: string): Promise<ContainerDetailResponseDto> {
    const container = (await this.prisma.container.findUnique({
      where: { id },
      include: {
        destinations: {
          orderBy: [
            { destinationCode: 'asc' },
            { destinationType: 'asc' },
            { packageType: 'asc' },
          ],
          include: {
            pallets: {
              select: {
                status: true,
                loadJobId: true,
                loadedAt: true,
              },
            },
          },
        },
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
    })) as ContainerRecord | null;

    if (!container) {
      throw new NotFoundException({
        code: 'CONTAINER_NOT_FOUND',
        message: `Container ${id} was not found.`,
        details: { id },
      });
    }

    return this.toContainerDetailResponse(container);
  }

  async createManualContainer(
    dto: CreateManualContainerDto,
    actor: AuthenticatedUser,
  ): Promise<ManualContainerResponseDto> {
    const containerNo = this.requiredString(dto.containerNo, 'containerNo');
    const learningCaseId = this.optionalLearningCaseId(dto.learningCaseId);
    const destinationInputs = await Promise.all(
      dto.destinations.map((destination, index) =>
        this.toManualDestinationCreateInput(destination, index + 1),
      ),
    );
    const createdAt = new Date();
    const correctedById = actor.id;
    if (learningCaseId) {
      this.parserLearningCases.assertCanTrain(actor);
    }

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const container = (await tx.container.create({
          data: {
            containerNo,
            sourceFormat: FileFormat.UNKNOWN,
            parserVersion: 'manual-entry-v1',
            parserSourceKind: 'MANUAL',
            dockNo: this.stringOrNull(dto.dockNo),
            company: this.stringOrNull(dto.company),
            status: ContainerStatus.CORRECTED,
            rawJson: {
              source: 'manual-unloading-report',
              createdAt: createdAt.toISOString(),
            },
            warnings: [],
            errors: [],
          },
        })) as ContainerRecord;

        const destinations: ContainerDestinationRecord[] = [];
        for (const input of destinationInputs) {
          destinations.push(
            await tx.containerDestination.create({
              data: {
                containerId: container.id,
                ...input,
              },
            }),
          );
        }

        const corrections = await this.createCorrections(
          tx,
          [
            {
              fieldName: 'manualContainer',
              oldValue: null,
              newValue: {
                containerNo,
                dockNo: this.stringOrNull(dto.dockNo),
                company: this.stringOrNull(dto.company),
                destinationCount: destinations.length,
              },
            },
          ],
          {
            targetType: CorrectionTargetType.CONTAINER,
            containerId: container.id,
          },
          dto.reason ?? 'Manual unloading report created',
          dto.correctionNote,
          correctedById,
        );

        for (const destination of destinations) {
          corrections.push(
            ...(await this.createCorrections(
              tx,
              [
                {
                  fieldName: 'manualContainerDestination',
                  oldValue: null,
                  newValue: {
                    destinationCode: destination.destinationCode,
                    destinationType: destination.destinationType,
                    cartons: destination.cartons,
                    volume: destination.volume.toString(),
                    manualPallets: destination.manualPallets,
                    finalPallets: destination.finalPallets,
                    palletPolicySnapshot:
                      destination.palletPolicySnapshot ?? null,
                    note: destination.note,
                  },
                },
              ],
              {
                targetType: CorrectionTargetType.CONTAINER_DESTINATION,
                containerId: container.id,
                containerDestinationId: destination.id,
              },
              dto.reason ?? 'Manual unloading destination created',
              dto.correctionNote,
              correctedById,
            )),
          );
        }

        const learningCase = learningCaseId
          ? await this.parserLearningCases.linkContainerInTransaction(
              tx,
              learningCaseId,
              container.id,
              actor,
            )
          : null;

        return {
          container: {
            ...container,
            destinations,
          },
          corrections,
          learningCase,
        };
      });

      return {
        container: this.toContainerDetailResponse(result.container),
        corrections: result.corrections.map((record) =>
          this.toCorrectionResponse(record),
        ),
        learningCase: result.learningCase ? result.learningCase : null,
      };
    } catch (error) {
      this.throwConflictIfUnique(error, 'MANUAL_CONTAINER_CREATE_CONFLICT');
      throw error;
    }
  }

  async updateContainer(
    id: string,
    dto: UpdateContainerDto,
    actor: AuthenticatedUser,
  ): Promise<ContainerCorrectionResponseDto> {
    const existing = (await this.prisma.container.findUnique({
      where: { id },
      include: {
        destinations: {
          include: {
            pallets: {
              select: {
                status: true,
                loadJobId: true,
                loadedAt: true,
              },
            },
          },
        },
      },
    })) as ContainerRecord | null;

    if (!existing) {
      throw new NotFoundException({
        code: 'CONTAINER_NOT_FOUND',
        message: `Container ${id} was not found.`,
        details: { id },
      });
    }
    const unloadInventorySyncRequested =
      dto.status === ContainerStatus.UNLOADED;
    if (
      !(
        unloadInventorySyncRequested &&
        existing.status === ContainerStatus.UNLOADED
      )
    ) {
      this.assertContainerEditableForStatusUpdate(existing, dto.status);
    }
    const correctedById = auditUserId(actor, dto.correctedById);

    const data: Prisma.ContainerUpdateInput = {};
    const changes: Change[] = [];
    this.addStringChange(dto, existing, data, changes, 'containerNo');
    this.addNullableStringChange(dto, existing, data, changes, 'dockNo');
    this.addNullableStringChange(dto, existing, data, changes, 'company');
    this.addStatusChange(dto, existing, data, changes);
    if (!this.hasProvided(dto, 'status') && changes.length > 0) {
      data.status = ContainerStatus.CORRECTED;
    }
    if (!unloadInventorySyncRequested) {
      this.assertHasChanges(changes);
    }

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        if (!unloadInventorySyncRequested) {
          const lockedContainer = await this.lockContainerCorrectionScope(tx, {
            containerId: id,
          });
          this.assertContainerEditableForStatusUpdate(
            lockedContainer,
            dto.status,
          );
        }
        const inventorySync = unloadInventorySyncRequested
          ? await this.palletInventorySync.synchronizeForUnloading(tx, {
              containerId: id,
              actorId: correctedById,
            })
          : null;
        const container =
          Object.keys(data).length > 0
            ? ((await tx.container.update({
                where: { id },
                data,
              })) as ContainerRecord)
            : existing;
        const corrections =
          changes.length > 0
            ? await this.createCorrections(
                tx,
                changes,
                {
                  targetType: CorrectionTargetType.CONTAINER,
                  containerId: id,
                },
                dto.reason,
                dto.correctionNote,
                correctedById,
              )
            : [];
        await this.revokeTrustedProfileForMaterialCorrection(
          tx,
          id,
          actor.id,
          changes.filter((change) => change.fieldName === 'containerNo'),
          corrections.map((correction) => correction.id),
        );

        return { container, corrections, inventorySync };
      });

      const completionCapture = unloadInventorySyncRequested
        ? await this.parserLearningCases.captureAndDispatchCompletion(id, actor)
        : null;

      return {
        container: this.toContainerResponse(result.container),
        corrections: result.corrections.map((record) =>
          this.toCorrectionResponse(record),
        ),
        inventorySync: result.inventorySync,
        parserLearning: completionCapture
          ? {
              learningCaseId: completionCapture.learningCaseId,
              snapshotCreated: completionCapture.snapshotCreated,
              replayJobId: completionCapture.replayJobId,
              warningCodes: completionCapture.warningCodes,
            }
          : null,
      };
    } catch (error) {
      if (unloadInventorySyncRequested) {
        const concurrentException =
          this.palletInventorySync.concurrentException(error, id);
        if (concurrentException) {
          throw concurrentException;
        }
      }
      this.throwConflictIfUnique(error, 'CONTAINER_CORRECTION_CONFLICT');
      throw error;
    }
  }

  async updateContainerDestination(
    id: string,
    dto: UpdateContainerDestinationDto,
    actor: AuthenticatedUser,
  ): Promise<ContainerDestinationCorrectionResponseDto> {
    const existing = (await this.prisma.containerDestination.findUnique({
      where: { id },
    })) as ContainerDestinationRecord | null;

    if (!existing) {
      throw new NotFoundException({
        code: 'CONTAINER_DESTINATION_NOT_FOUND',
        message: `Container destination ${id} was not found.`,
        details: { id },
      });
    }
    const container = await this.findContainerLifecycleOrThrow(
      this.prisma,
      existing.containerId,
    );
    this.assertContainerEditable(
      effectiveContainerStatus(container.status, container.destinations ?? []),
      existing.containerId,
    );
    const correctedById = auditUserId(actor, dto.correctedById);

    const data: Prisma.ContainerDestinationUpdateInput = {};
    const changes: Change[] = [];
    this.addStringChange(dto, existing, data, changes, 'destinationCode');
    this.addNullableStringChange(
      dto,
      existing,
      data,
      changes,
      'destinationType',
    );
    this.addNumberChange(dto, existing, data, changes, 'cartons');
    this.addDecimalChange(dto, existing, data, changes, 'volume');
    this.addNullableStringChange(dto, existing, data, changes, 'note');
    await this.applyDestinationPalletRuleChanges(dto, existing, data, changes);
    this.assertHasChanges(changes);

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const lockedContainer = await this.lockContainerCorrectionScope(tx, {
          containerId: existing.containerId,
          destinationIds: [id],
        });
        this.assertContainerEditable(
          effectiveContainerStatus(
            lockedContainer.status,
            lockedContainer.destinations ?? [],
          ),
          existing.containerId,
        );
        const containerDestination = (await tx.containerDestination.update({
          where: { id },
          data,
        })) as ContainerDestinationRecord;
        await tx.container.update({
          where: { id: existing.containerId },
          data: { status: ContainerStatus.CORRECTED },
        });
        const corrections = await this.createCorrections(
          tx,
          changes,
          {
            targetType: CorrectionTargetType.CONTAINER_DESTINATION,
            containerId: existing.containerId,
            containerDestinationId: id,
          },
          dto.reason,
          dto.correctionNote,
          correctedById,
        );
        await this.revokeTrustedProfileForMaterialCorrection(
          tx,
          existing.containerId,
          actor.id,
          changes.filter((change) =>
            [
              'destinationCode',
              'destinationType',
              'cartons',
              'volume',
              'packageType',
            ].includes(change.fieldName),
          ),
          corrections.map((correction) => correction.id),
        );

        return { containerDestination, corrections };
      });

      return {
        containerDestination: this.toContainerDestinationResponse(
          result.containerDestination,
        ),
        corrections: result.corrections.map((record) =>
          this.toCorrectionResponse(record),
        ),
      };
    } catch (error) {
      this.throwConflictIfUnique(
        error,
        'CONTAINER_DESTINATION_CORRECTION_CONFLICT',
      );
      throw error;
    }
  }

  async createContainerDestination(
    containerId: string,
    dto: CreateContainerDestinationDto,
    actor: AuthenticatedUser,
  ): Promise<ContainerDestinationCorrectionResponseDto> {
    const container = (await this.prisma.container.findUnique({
      where: { id: containerId },
      include: {
        destinations: {
          include: {
            pallets: {
              select: {
                status: true,
                loadJobId: true,
                loadedAt: true,
              },
            },
          },
        },
      },
    })) as ContainerRecord | null;

    if (!container) {
      throw new NotFoundException({
        code: 'CONTAINER_NOT_FOUND',
        message: `Container ${containerId} was not found.`,
        details: { id: containerId },
      });
    }
    this.assertContainerEditable(
      effectiveContainerStatus(container.status, container.destinations ?? []),
      containerId,
    );
    const correctedById = auditUserId(actor, dto.correctedById);

    const destinationCode = this.stringOrNull(dto.destinationCode);
    if (!destinationCode) {
      throw new BadRequestException({
        code: 'INVALID_DESTINATION_VALUE',
        message: 'Destination code cannot be empty.',
        details: { fieldName: 'destinationCode' },
      });
    }

    const manualPallets =
      dto.manualPallets === null || dto.manualPallets === undefined
        ? null
        : Number(dto.manualPallets);
    this.assertPositiveManualPallets(manualPallets, 'manualPallets');
    const volume = this.decimalString(dto.volume);
    const packageType = this.normalizePackageTypeForStorage(dto.packageType);
    const palletRule = await this.calculateDestinationPalletRule({
      cartons: Number(dto.cartons),
      destinationCode,
      manualPallets,
      packageType,
      volumeCbm: volume,
    });
    const calculatedPallets = palletRule.calculatedPallets;
    const createData: Prisma.ContainerDestinationUncheckedCreateInput = {
      containerId,
      destinationCode,
      destinationType: this.stringOrNull(dto.destinationType),
      packageType: palletRule.storedPackageType,
      cartons: Number(dto.cartons),
      volume,
      calculatedPallets,
      manualPallets,
      finalPallets: palletRule.finalPallets,
      palletRuleCode: palletRule.palletRuleCode,
      calculationBasisCbm: palletRule.calculationBasisCbm,
      roundingMode: palletRule.roundingMode,
      palletPolicySnapshot: this.nullableJsonValue(
        palletRule.palletPolicySnapshot,
      ),
      note: this.stringOrNull(dto.note),
      warnings: this.nullableJsonValue(palletRule.warnings),
      errors: [],
    };
    const change: Change = {
      fieldName: 'containerDestination',
      oldValue: null,
      newValue: {
        destinationCode: createData.destinationCode,
        destinationType: createData.destinationType,
        packageType: this.packageTypeOrNull(createData.packageType),
        cartons: createData.cartons,
        volume: createData.volume,
        manualPallets: createData.manualPallets,
        finalPallets: createData.finalPallets,
        palletRuleCode: createData.palletRuleCode,
        calculationBasisCbm: createData.calculationBasisCbm,
        roundingMode: createData.roundingMode,
        palletPolicySnapshot: palletRule.palletPolicySnapshot,
        note: createData.note,
      },
    };

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const lockedContainer = await this.lockContainerCorrectionScope(tx, {
          containerId,
        });
        this.assertContainerEditable(
          effectiveContainerStatus(
            lockedContainer.status,
            lockedContainer.destinations ?? [],
          ),
          containerId,
        );
        const containerDestination = (await tx.containerDestination.create({
          data: createData,
        })) as ContainerDestinationRecord;
        await tx.container.update({
          where: { id: containerId },
          data: { status: ContainerStatus.CORRECTED },
        });
        const corrections = await this.createCorrections(
          tx,
          [change],
          {
            targetType: CorrectionTargetType.CONTAINER_DESTINATION,
            containerId,
            containerDestinationId: containerDestination.id,
          },
          dto.reason ?? 'Manual actual unloading entry',
          dto.correctionNote,
          correctedById,
        );
        await this.revokeTrustedProfileForMaterialCorrection(
          tx,
          containerId,
          actor.id,
          [change],
          corrections.map((correction) => correction.id),
        );

        return { containerDestination, corrections };
      });

      return {
        containerDestination: this.toContainerDestinationResponse(
          result.containerDestination,
        ),
        corrections: result.corrections.map((record) =>
          this.toCorrectionResponse(record),
        ),
      };
    } catch (error) {
      this.throwConflictIfUnique(
        error,
        'CONTAINER_DESTINATION_CORRECTION_CONFLICT',
      );
      throw error;
    }
  }

  async deleteContainerDestination(
    id: string,
    actor: AuthenticatedUser,
  ): Promise<ContainerDestinationCorrectionResponseDto> {
    const existing = (await this.prisma.containerDestination.findUnique({
      where: { id },
    })) as ContainerDestinationRecord | null;

    if (!existing) {
      throw new NotFoundException({
        code: 'CONTAINER_DESTINATION_NOT_FOUND',
        message: `Container destination ${id} was not found.`,
        details: { id },
      });
    }

    const container = await this.findContainerLifecycleOrThrow(
      this.prisma,
      existing.containerId,
    );
    this.assertContainerEditable(
      effectiveContainerStatus(container.status, container.destinations ?? []),
      existing.containerId,
    );
    const correctedById = auditUserId(actor);
    const change: Change = {
      fieldName: 'containerDestination',
      oldValue: this.containerDestinationSnapshot(existing),
      newValue: null,
    };

    const corrections = await this.prisma.$transaction(async (tx) => {
      const lockedContainer = await this.lockContainerCorrectionScope(tx, {
        containerId: existing.containerId,
        destinationIds: [existing.id],
      });
      this.assertContainerEditable(
        effectiveContainerStatus(
          lockedContainer.status,
          lockedContainer.destinations ?? [],
        ),
        existing.containerId,
      );
      const records = await this.createCorrections(
        tx,
        [change],
        {
          targetType: CorrectionTargetType.CONTAINER_DESTINATION,
          containerId: existing.containerId,
          containerDestinationId: existing.id,
        },
        'Destination removed from actual unloading data',
        null,
        correctedById,
      );
      await this.revokeTrustedProfileForMaterialCorrection(
        tx,
        existing.containerId,
        actor.id,
        [change],
        records.map((record) => record.id),
      );
      await tx.pallet.deleteMany({
        where: { containerDestinationId: existing.id },
      });
      await tx.loadJobLine.deleteMany({
        where: { containerDestinationId: existing.id },
      });
      await tx.containerDestination.delete({
        where: { id: existing.id },
      });
      await tx.container.update({
        where: { id: existing.containerId },
        data: { status: ContainerStatus.CORRECTED },
      });

      return records;
    });

    return {
      containerDestination: this.toContainerDestinationResponse(existing),
      corrections: corrections.map((record) =>
        this.toCorrectionResponse(record),
      ),
    };
  }

  async createCorrection(
    dto: CreateCorrectionDto,
    actor: AuthenticatedUser,
  ): Promise<CorrectionFeedbackResponseDto> {
    const targetType = this.targetType(dto.targetType);
    const target = this.targetForDto(dto, targetType);
    this.assertCorrectionValuesProvided(dto);
    const correctedById = auditUserId(actor, dto.correctedById);

    const record = await this.prisma.$transaction(async (tx) => {
      await this.assertTargetExists(tx, targetType, target);
      return await tx.correctionFeedback.create({
        data: {
          ...target,
          targetType,
          fieldName: dto.fieldName,
          oldValue: this.nullableJsonValue(dto.oldValue),
          newValue: this.nullableJsonValue(dto.newValue),
          reason: this.stringOrNull(dto.reason),
          note: this.stringOrNull(dto.note),
          correctedById,
        },
      });
    });

    return this.toCorrectionResponse(record);
  }

  async listCorrections(
    query: ListCorrectionsQueryDto,
  ): Promise<CorrectionListResponseDto> {
    const where: Prisma.CorrectionFeedbackWhereInput = {};
    if (query.targetType) {
      where.targetType = this.targetType(query.targetType);
    }
    if (query.containerId) {
      where.containerId = query.containerId;
    }
    if (query.containerDestinationId) {
      where.containerDestinationId = query.containerDestinationId;
    }
    if (query.correctedById) {
      where.correctedById = query.correctedById;
    }

    const records = (await this.prisma.correctionFeedback.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: query.limit,
      skip: query.offset,
    })) as CorrectionFeedbackRecord[];

    return {
      items: records.map((record) => this.toCorrectionResponse(record)),
      limit: query.limit,
      offset: query.offset,
    };
  }

  private async createCorrections(
    tx: Prisma.TransactionClient,
    changes: Change[],
    target: {
      targetType: CorrectionTargetTypeValue;
      containerId?: string;
      containerDestinationId?: string;
    },
    reason: string | null | undefined,
    note: string | null | undefined,
    correctedById: string | null | undefined,
  ): Promise<CorrectionFeedbackRecord[]> {
    const records: CorrectionFeedbackRecord[] = [];

    for (const change of changes) {
      records.push(
        await tx.correctionFeedback.create({
          data: {
            targetType: target.targetType,
            containerId: target.containerId ?? null,
            containerDestinationId: target.containerDestinationId ?? null,
            fieldName: change.fieldName,
            oldValue: this.nullableJsonValue(change.oldValue),
            newValue: this.nullableJsonValue(change.newValue),
            reason: this.stringOrNull(reason),
            note: this.stringOrNull(note),
            correctedById: this.stringOrNull(correctedById),
          },
        }),
      );
    }

    return records;
  }

  private async revokeTrustedProfileForMaterialCorrection(
    tx: Prisma.TransactionClient,
    containerId: string,
    actorId: string,
    materialChanges: Change[],
    correctionFeedbackIds: string[],
  ): Promise<void> {
    if (materialChanges.length === 0) return;
    const container = await tx.container.findUnique({
      where: { id: containerId },
      select: {
        importFileId: true,
        parserSourceKind: true,
        parserProfileVersionId: true,
      },
    });
    if (
      container?.parserSourceKind !== ParserSourceKind.PROFILE ||
      !container.parserProfileVersionId
    ) {
      return;
    }

    await tx.$queryRaw`SELECT "id" FROM "parser_profile_versions" WHERE "id" = ${container.parserProfileVersionId} FOR UPDATE`;
    const profile = await tx.parserProfileVersion.findUnique({
      where: { id: container.parserProfileVersionId },
      select: {
        id: true,
        familyId: true,
        trustState: true,
        trustStreak: true,
      },
    });
    if (!profile || profile.trustState !== ParserProfileTrustState.TRUSTED) {
      return;
    }

    await tx.parserProfileVersion.update({
      where: { id: profile.id },
      data: {
        trustState: ParserProfileTrustState.REVIEW_REQUIRED,
        trustStreak: 0,
        lifecycleRevision: { increment: 1 },
      },
    });
    await tx.parserProfileAuditEvent.create({
      data: {
        eventCode:
          ParserProfileAuditEventCode.TRUST_REVOKED_BY_MATERIAL_CORRECTION,
        actorId,
        profileFamilyId: profile.familyId,
        profileVersionId: profile.id,
        importFileId: container.importFileId,
        containerId,
        metadata: this.nullableJsonValue({
          code: 'TRUST_REVOKED_BY_MATERIAL_CORRECTION',
          fieldNames: materialChanges.map((change) => change.fieldName).sort(),
          correctionFeedbackIds,
          previousTrustState: profile.trustState,
          previousTrustStreak: profile.trustStreak,
          trustState: ParserProfileTrustState.REVIEW_REQUIRED,
          trustStreak: 0,
        }),
      },
    });
  }

  private async toManualDestinationCreateInput(
    dto: CreateManualContainerDestinationDto,
    sequence: number,
  ): Promise<
    Omit<Prisma.ContainerDestinationUncheckedCreateInput, 'containerId'>
  > {
    const destinationCode = this.requiredString(
      dto.destinationCode,
      `destinations[${sequence}].destinationCode`,
    );
    const cartons = Number(dto.cartons);
    const pallets = Number(dto.pallets);
    this.assertPositiveManualPallets(
      pallets,
      `destinations[${sequence}].pallets`,
    );
    const volume =
      dto.volume === undefined || dto.volume === null
        ? '0.000'
        : this.decimalString(dto.volume);
    const palletRule = await this.calculateDestinationPalletRule({
      cartons,
      destinationCode,
      manualPallets: pallets,
      packageType: 'CARTON',
      volumeCbm: volume,
    });

    return {
      destinationCode,
      destinationType: this.stringOrNull(dto.destinationType),
      packageType: 'CARTON',
      cartons,
      volume,
      calculatedPallets: palletRule.calculatedPallets,
      manualPallets: pallets,
      finalPallets: pallets,
      palletRuleCode: palletRule.palletRuleCode,
      calculationBasisCbm: palletRule.calculationBasisCbm,
      roundingMode: palletRule.roundingMode,
      palletPolicySnapshot: this.nullableJsonValue(
        palletRule.palletPolicySnapshot,
      ),
      note: this.stringOrNull(dto.note),
      warnings: this.nullableJsonValue(palletRule.warnings),
      errors: [],
    };
  }

  private assertCorrectionValuesProvided(dto: CreateCorrectionDto): void {
    if (
      this.hasProvided(dto, 'oldValue') &&
      this.hasProvided(dto, 'newValue')
    ) {
      return;
    }

    throw new BadRequestException({
      code: 'CORRECTION_VALUES_REQUIRED',
      message:
        'oldValue and newValue must be provided for correction feedback.',
      details: {},
    });
  }

  private addStringChange(
    dto: object,
    existing: object,
    data: object,
    changes: Change[],
    fieldName: string,
  ): void {
    if (!this.hasProvided(dto, fieldName)) {
      return;
    }

    const newValue = this.stringOrNull(dto[fieldName as keyof typeof dto]);
    if (!newValue) {
      throw new BadRequestException({
        code: 'INVALID_CORRECTION_VALUE',
        message: `${fieldName} cannot be empty.`,
        details: { fieldName },
      });
    }

    this.addChange(existing, data, changes, fieldName, newValue);
  }

  private addNullableStringChange(
    dto: object,
    existing: object,
    data: object,
    changes: Change[],
    fieldName: string,
  ): void {
    if (!this.hasProvided(dto, fieldName)) {
      return;
    }

    const newValue = this.stringOrNull(dto[fieldName as keyof typeof dto]);
    this.addChange(existing, data, changes, fieldName, newValue);
  }

  private addNumberChange(
    dto: object,
    existing: object,
    data: object,
    changes: Change[],
    fieldName: string,
  ): void {
    if (!this.hasProvided(dto, fieldName)) {
      return;
    }

    const newValue = Number(dto[fieldName as keyof typeof dto]);
    this.addChange(existing, data, changes, fieldName, newValue);
  }

  private addDecimalChange(
    dto: object,
    existing: object,
    data: object,
    changes: Change[],
    fieldName: string,
  ): void {
    if (!this.hasProvided(dto, fieldName)) {
      return;
    }

    const newValue = this.decimalString(dto[fieldName as keyof typeof dto]);
    this.addChange(existing, data, changes, fieldName, newValue);
  }

  private async applyDestinationPalletRuleChanges(
    dto: UpdateContainerDestinationDto,
    existing: ContainerDestinationRecord,
    data: Prisma.ContainerDestinationUpdateInput,
    changes: Change[],
  ): Promise<void> {
    const shouldRecalculate =
      this.hasProvided(dto, 'destinationCode') ||
      this.hasProvided(dto, 'packageType') ||
      this.hasProvided(dto, 'cartons') ||
      this.hasProvided(dto, 'volume');
    const nextPackageType = this.hasProvided(dto, 'packageType')
      ? this.normalizePackageTypeForStorage(dto.packageType)
      : this.normalizePackageTypeForStorage(existing.packageType);
    const nextCartons = this.hasProvided(dto, 'cartons')
      ? Number(dto.cartons)
      : existing.cartons;
    const nextVolume = this.hasProvided(dto, 'volume')
      ? this.decimalString(dto.volume)
      : existing.volume.toString();
    const nextDestinationCode = this.hasProvided(dto, 'destinationCode')
      ? this.requiredString(dto.destinationCode, 'destinationCode')
      : existing.destinationCode;
    const manualPallets = this.hasProvided(dto, 'manualPallets')
      ? dto.manualPallets === null || dto.manualPallets === undefined
        ? null
        : Number(dto.manualPallets)
      : existing.manualPallets;
    if (this.hasProvided(dto, 'manualPallets')) {
      this.assertPositiveManualPallets(manualPallets, 'manualPallets');
    }
    const rule = shouldRecalculate
      ? await this.calculateDestinationPalletRule({
          cartons: nextCartons,
          destinationCode: nextDestinationCode,
          manualPallets,
          packageType: nextPackageType,
          volumeCbm: nextVolume,
        })
      : null;

    if (this.hasProvided(dto, 'packageType')) {
      this.addPackageTypeChange(
        existing,
        data,
        changes,
        rule?.storedPackageType ?? nextPackageType,
      );
    }

    if (rule) {
      this.addChange(
        existing,
        data,
        changes,
        'calculatedPallets',
        rule.calculatedPallets,
      );
      this.addChange(
        existing,
        data,
        changes,
        'palletRuleCode',
        rule.palletRuleCode,
      );
      this.addChange(
        existing,
        data,
        changes,
        'calculationBasisCbm',
        rule.calculationBasisCbm,
      );
      this.addChange(
        existing,
        data,
        changes,
        'roundingMode',
        rule.roundingMode,
      );
      this.applyPalletWarningsChange(existing, data, changes, rule.warnings);
    }

    const calculatedPallets =
      rule?.calculatedPallets ?? existing.calculatedPallets;
    const finalPallets = manualPallets ?? calculatedPallets;

    if (
      this.hasProvided(dto, 'manualPallets') &&
      !this.sameValue(existing.manualPallets, manualPallets)
    ) {
      data.manualPallets = manualPallets;
      changes.push({
        fieldName: 'manualPallets',
        oldValue: existing.manualPallets,
        newValue: manualPallets,
      });
    }

    if (!this.sameValue(existing.finalPallets, finalPallets)) {
      data.finalPallets = finalPallets;
      changes.push({
        fieldName: 'finalPallets',
        oldValue: existing.finalPallets,
        newValue: finalPallets,
      });
    }

    const policySnapshot =
      rule?.palletPolicySnapshot ??
      this.withManualPalletSnapshot(
        existing.palletPolicySnapshot,
        manualPallets,
        finalPallets,
      );
    if (policySnapshot !== null) {
      this.addJsonChange(
        existing,
        data,
        changes,
        'palletPolicySnapshot',
        policySnapshot,
      );
    }
  }

  private addPackageTypeChange(
    existing: ContainerDestinationRecord,
    data: Prisma.ContainerDestinationUpdateInput,
    changes: Change[],
    packageType: PackageTypeForStorage,
  ): void {
    if (this.sameValue(existing.packageType ?? 'UNSPECIFIED', packageType)) {
      return;
    }

    data.packageType = packageType;
    changes.push({
      fieldName: 'packageType',
      oldValue: this.packageTypeOrNull(existing.packageType),
      newValue: this.packageTypeOrNull(packageType),
    });
  }

  private applyPalletWarningsChange(
    existing: ContainerDestinationRecord,
    data: Prisma.ContainerDestinationUpdateInput,
    changes: Change[],
    ruleWarnings: DestinationPalletRuleResult['warnings'],
  ): void {
    const warnings = this.mergePalletRuleWarnings(
      existing.warnings,
      ruleWarnings,
    );
    if (this.sameJsonValue(existing.warnings ?? [], warnings)) {
      return;
    }

    data.warnings = this.nullableJsonValue(warnings);
    changes.push({
      fieldName: 'warnings',
      oldValue: existing.warnings ?? null,
      newValue: warnings,
    });
  }

  private addJsonChange(
    existing: object,
    data: object,
    changes: Change[],
    fieldName: string,
    newValue: unknown,
  ): void {
    const oldValue = (existing as Record<string, unknown>)[fieldName] ?? null;
    if (this.sameJsonValue(oldValue, newValue)) {
      return;
    }

    (data as Record<string, unknown>)[fieldName] =
      this.nullableJsonValue(newValue);
    changes.push({ fieldName, oldValue, newValue });
  }

  private withManualPalletSnapshot(
    snapshot: unknown,
    manualPallets: number | null,
    finalPallets: number,
  ): Record<string, unknown> | null {
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
      return null;
    }

    return {
      ...(snapshot as Record<string, unknown>),
      manualPallets,
      finalPallets,
    };
  }

  private addStatusChange(
    dto: UpdateContainerDto,
    existing: ContainerRecord,
    data: Prisma.ContainerUpdateInput,
    changes: Change[],
  ): void {
    if (!this.hasProvided(dto, 'status')) {
      return;
    }

    const status = this.containerStatus(dto.status);
    this.assertContainerStatusCanBeSet(existing, status);
    this.addChange(existing, data, changes, 'status', status);
  }

  private addChange(
    existing: object,
    data: object,
    changes: Change[],
    fieldName: string,
    newValue: unknown,
  ): void {
    const oldValue = (existing as Record<string, unknown>)[fieldName];
    if (this.sameValue(oldValue, newValue)) {
      return;
    }

    (data as Record<string, unknown>)[fieldName] = newValue;
    changes.push({ fieldName, oldValue, newValue });
  }

  private assertHasChanges(changes: Change[]): void {
    if (changes.length > 0) {
      return;
    }

    throw new BadRequestException({
      code: 'NO_CORRECTION_FIELDS_CHANGED',
      message: 'At least one correction field must change.',
      details: {},
    });
  }

  private assertPositiveManualPallets(
    value: number | null,
    fieldName: string,
  ): void {
    if (value === null || value >= 1) {
      return;
    }

    throw new BadRequestException({
      code: 'INVALID_MANUAL_PALLETS',
      message:
        'Manual pallets must be 1 or greater. Delete the destination instead when there is no cargo.',
      details: { fieldName },
    });
  }

  private targetForDto(
    dto: CreateCorrectionDto,
    targetType: CorrectionTargetTypeValue,
  ): Record<string, string | null> {
    const expectedField = this.targetIdField(targetType);
    const providedFields = TARGET_ID_FIELDS.filter((field) =>
      this.stringOrNull(dto[field]),
    );

    if (providedFields.length !== 1 || providedFields[0] !== expectedField) {
      throw new BadRequestException({
        code: 'INVALID_CORRECTION_TARGET',
        message:
          'Exactly one target id matching targetType must be provided for correction feedback.',
        details: {
          targetType,
          expectedField,
          providedFields,
        },
      });
    }

    return {
      [expectedField]: this.stringOrNull(dto[expectedField]),
    };
  }

  private async assertTargetExists(
    tx: Prisma.TransactionClient,
    targetType: CorrectionTargetTypeValue,
    target: Record<string, string | null>,
  ): Promise<void> {
    const id = Object.values(target).find(
      (value): value is string => typeof value === 'string' && value !== '',
    );
    let record: unknown;

    if (!id) {
      throw new BadRequestException({
        code: 'INVALID_CORRECTION_TARGET',
        message: 'Correction target id must be provided.',
        details: { targetType },
      });
    }

    if (targetType === CorrectionTargetType.IMPORT_FILE) {
      record = await tx.importFile.findUnique({ where: { id } });
    } else if (targetType === CorrectionTargetType.CONTAINER) {
      record = await tx.container.findUnique({ where: { id } });
    } else if (targetType === CorrectionTargetType.CONTAINER_LINE) {
      record = await tx.containerLine.findUnique({ where: { id } });
    } else if (targetType === CorrectionTargetType.CONTAINER_DESTINATION) {
      record = await tx.containerDestination.findUnique({ where: { id } });
    } else if (targetType === CorrectionTargetType.PALLET) {
      record = await tx.pallet.findUnique({ where: { id } });
    } else if (targetType === CorrectionTargetType.GENERATED_FILE) {
      record = await tx.generatedFile.findUnique({ where: { id } });
    } else if (targetType === CorrectionTargetType.ATTENDANCE_IMPORT) {
      record = await tx.attendanceImport.findUnique({ where: { id } });
    } else if (targetType === CorrectionTargetType.PAY_CONTAINER) {
      record = await tx.payContainer.findUnique({ where: { id } });
    } else if (targetType === CorrectionTargetType.UNLOADING_WAGE_SETTLEMENT) {
      record = await tx.unloadingWageSettlement.findUnique({ where: { id } });
    }

    if (!record) {
      throw new NotFoundException({
        code: 'CORRECTION_TARGET_NOT_FOUND',
        message: `Correction target ${id} was not found.`,
        details: { targetType, id },
      });
    }
  }

  private targetIdField(
    targetType: CorrectionTargetTypeValue,
  ): (typeof TARGET_ID_FIELDS)[number] {
    const fieldByTargetType = {
      [CorrectionTargetType.IMPORT_FILE]: 'importFileId',
      [CorrectionTargetType.CONTAINER]: 'containerId',
      [CorrectionTargetType.CONTAINER_LINE]: 'containerLineId',
      [CorrectionTargetType.CONTAINER_DESTINATION]: 'containerDestinationId',
      [CorrectionTargetType.PALLET]: 'palletId',
      [CorrectionTargetType.GENERATED_FILE]: 'generatedFileId',
      [CorrectionTargetType.ATTENDANCE_IMPORT]: 'attendanceImportId',
      [CorrectionTargetType.PAY_CONTAINER]: 'payContainerId',
      [CorrectionTargetType.UNLOADING_WAGE_SETTLEMENT]:
        'unloadingWageSettlementId',
    } as const;

    return fieldByTargetType[targetType];
  }

  private targetType(value: string): CorrectionTargetTypeValue {
    if (
      value === CorrectionTargetType.IMPORT_FILE ||
      value === CorrectionTargetType.CONTAINER ||
      value === CorrectionTargetType.CONTAINER_LINE ||
      value === CorrectionTargetType.CONTAINER_DESTINATION ||
      value === CorrectionTargetType.PALLET ||
      value === CorrectionTargetType.GENERATED_FILE ||
      value === CorrectionTargetType.ATTENDANCE_IMPORT ||
      value === CorrectionTargetType.PAY_CONTAINER ||
      value === CorrectionTargetType.UNLOADING_WAGE_SETTLEMENT
    ) {
      return value;
    }

    throw new BadRequestException({
      code: 'INVALID_CORRECTION_TARGET_TYPE',
      message: `Unsupported correction target type: ${value}`,
      details: { targetType: value },
    });
  }

  private containerStatus(value: string | undefined): string {
    if (
      value === ContainerStatus.IMPORTED ||
      value === ContainerStatus.PARSED ||
      value === ContainerStatus.CORRECTED ||
      value === ContainerStatus.REPORT_GENERATED ||
      value === ContainerStatus.LABELS_GENERATED ||
      value === ContainerStatus.UNLOADED ||
      value === ContainerStatus.LOADING_IN_PROGRESS ||
      value === ContainerStatus.LOADED ||
      value === ContainerStatus.ERROR
    ) {
      return value;
    }

    throw new BadRequestException({
      code: 'INVALID_CONTAINER_STATUS',
      message: `Unsupported container status: ${value ?? ''}`,
      details: { status: value },
    });
  }

  private toContainerResponse(record: ContainerRecord) {
    return {
      id: record.id,
      importFileId: record.importFileId,
      containerNo: record.containerNo,
      dockNo: record.dockNo,
      company: record.company,
      status: record.status,
      payClassification: record.payClassification ?? null,
      payTrailerNumber: record.payTrailerNumber ?? null,
      updatedAt: this.toIsoString(record.updatedAt),
    };
  }

  private toContainerDestinationResponse(record: ContainerDestinationRecord) {
    return {
      id: record.id,
      containerId: record.containerId,
      destinationCode: record.destinationCode,
      destinationType: record.destinationType,
      packageType: this.effectivePackageTypeForResponse(record.packageType),
      cartons: record.cartons,
      volume: record.volume.toString(),
      calculatedPallets: record.calculatedPallets,
      manualPallets: record.manualPallets,
      finalPallets: record.finalPallets,
      palletRuleCode: record.palletRuleCode ?? null,
      calculationBasisCbm:
        record.calculationBasisCbm === undefined ||
        record.calculationBasisCbm === null
          ? null
          : record.calculationBasisCbm.toString(),
      roundingMode: record.roundingMode ?? null,
      palletPolicySnapshot: record.palletPolicySnapshot ?? null,
      note: record.note,
      updatedAt: this.toIsoString(record.updatedAt),
    };
  }

  private containerDestinationSnapshot(
    record: ContainerDestinationRecord,
  ): Record<string, unknown> {
    return {
      id: record.id,
      containerId: record.containerId,
      destinationCode: record.destinationCode,
      destinationType: record.destinationType,
      packageType: this.packageTypeOrNull(record.packageType),
      cartons: record.cartons,
      volume: record.volume.toString(),
      calculatedPallets: record.calculatedPallets,
      manualPallets: record.manualPallets,
      finalPallets: record.finalPallets,
      palletRuleCode: record.palletRuleCode ?? null,
      calculationBasisCbm:
        record.calculationBasisCbm === undefined ||
        record.calculationBasisCbm === null
          ? null
          : record.calculationBasisCbm.toString(),
      roundingMode: record.roundingMode ?? null,
      palletPolicySnapshot: record.palletPolicySnapshot ?? null,
      note: record.note,
      warnings: record.warnings ?? null,
      errors: record.errors ?? null,
    };
  }

  private toContainerDetailResponse(
    record: ContainerRecord,
  ): ContainerDetailResponseDto {
    const destinations = record.destinations ?? [];
    const status = effectiveContainerStatus(record.status, destinations);

    return {
      id: record.id,
      importFileId: record.importFileId,
      containerNo: record.containerNo,
      dockNo: record.dockNo,
      company: record.company,
      sourceFormat: record.sourceFormat ?? 'UNKNOWN',
      parserVersion: record.parserVersion ?? null,
      status,
      payClassification: record.payClassification ?? null,
      payTrailerNumber: record.payTrailerNumber ?? null,
      payContainers:
        record.payContainerLinks?.map((link) => ({
          id: link.id,
          payContainerId: link.payContainerId,
          payContainerNo: link.payContainer.payContainerNo,
          status: link.payContainer.status,
        })) ?? [],
      unloadingWage: this.toContainerUnloadingWageResponse(record),
      totalCartons: destinations.reduce(
        (total, destination) => total + destination.cartons,
        0,
      ),
      totalVolumeCbm: this.volumeTotal(destinations),
      rawJson: record.rawJson ?? null,
      warnings: record.warnings ?? null,
      errors: record.errors ?? null,
      createdAt: this.toIsoString(record.createdAt ?? record.updatedAt),
      updatedAt: this.toIsoString(record.updatedAt),
      destinations: destinations.map((destination) => ({
        id: destination.id,
        containerId: destination.containerId,
        destinationCode: destination.destinationCode,
        destinationType: destination.destinationType,
        packageType: this.effectivePackageTypeForResponse(
          destination.packageType,
        ),
        totalCartons: destination.cartons,
        totalVolumeCbm: destination.volume.toString(),
        calculatedPallets: destination.calculatedPallets,
        manualPallets: destination.manualPallets,
        finalPallets: destination.finalPallets,
        palletRuleCode: destination.palletRuleCode ?? null,
        calculationBasisCbm:
          destination.calculationBasisCbm === undefined ||
          destination.calculationBasisCbm === null
            ? null
            : destination.calculationBasisCbm.toString(),
        roundingMode: destination.roundingMode ?? null,
        palletPolicySnapshot: destination.palletPolicySnapshot ?? null,
        note: destination.note,
        warnings: destination.warnings ?? null,
        errors: destination.errors ?? null,
        createdAt: this.toIsoString(
          destination.createdAt ?? destination.updatedAt,
        ),
        updatedAt: this.toIsoString(destination.updatedAt),
      })),
    };
  }

  private toContainerUnloadingWageResponse(
    record: ContainerRecord,
  ): ContainerDetailResponseDto['unloadingWage'] {
    const payContainer = record.payContainerLinks?.[0]?.payContainer;
    if (!payContainer?.id) {
      return null;
    }

    return {
      payContainerId: payContainer.id,
      payContainerNo: payContainer.payContainerNo,
      classification: payContainer.classification ?? '',
      trailerNumber: payContainer.trailerNumber ?? null,
      status: payContainer.status,
      currency: payContainer.currency ?? 'CAD',
      rateAmount: payContainer.rateAmount?.toString() ?? '0.00',
      completedAt: payContainer.completedAt
        ? this.toIsoString(payContainer.completedAt)
        : null,
      completedById: payContainer.completedById ?? null,
      completionNote: payContainer.completionNote ?? null,
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

  private assertContainerEditable(status: string, containerId: string): void {
    if (!isContainerGenerationLocked(status)) {
      return;
    }

    throw new ConflictException({
      code: 'CONTAINER_NOT_EDITABLE',
      message:
        'This container has entered loading or has been loaded, so destination corrections are locked.',
      details: { containerId, status },
    });
  }

  private async lockContainerCorrectionScope(
    tx: Prisma.TransactionClient,
    input: { containerId: string; destinationIds?: string[] },
  ): Promise<ContainerRecord> {
    await lockContainerRow(tx, input.containerId);
    await lockContainerDestinationRows(tx, input.destinationIds ?? []);
    return await this.findContainerLifecycleOrThrow(tx, input.containerId);
  }

  private assertContainerEditableForStatusUpdate(
    container: ContainerRecord,
    requestedStatus: string | undefined,
  ): void {
    const effectiveStatus = effectiveContainerStatus(
      container.status,
      container.destinations ?? [],
    );
    if (requestedStatus === ContainerStatus.LOADED) {
      return;
    }
    if (!isContainerGenerationLocked(effectiveStatus)) {
      return;
    }

    if (
      requestedStatus !== undefined &&
      !this.hasLoadingEvidence(container) &&
      effectiveStatus === ContainerStatus.LOADING_IN_PROGRESS
    ) {
      return;
    }

    this.assertContainerEditable(effectiveStatus, container.id);
  }

  private assertContainerStatusCanBeSet(
    container: ContainerRecord,
    status: string,
  ): void {
    if (status !== ContainerStatus.LOADED) {
      return;
    }

    throw new ConflictException({
      code: 'CONTAINER_STATUS_LOADED_SCAN_ONLY',
      message:
        'Container status LOADED can only be set by loading scan transactions.',
      details: {
        containerId: container.id,
        requestedStatus: status,
      },
    });
  }

  private hasLoadingEvidence(container: ContainerRecord): boolean {
    return this.activePallets(container).some(
      (pallet) =>
        pallet.status === 'LOADING' ||
        pallet.status === 'LOADED' ||
        Boolean(pallet.loadJobId) ||
        Boolean(pallet.loadedAt),
    );
  }

  private activePallets(
    container: ContainerRecord,
  ): NonNullable<ContainerDestinationRecord['pallets']> {
    return (container.destinations ?? [])
      .flatMap((destination) => destination.pallets ?? [])
      .filter((pallet) => pallet.status !== 'CANCELLED');
  }

  private async findContainerLifecycleOrThrow(
    tx: Prisma.TransactionClient,
    id: string,
  ): Promise<ContainerRecord> {
    const container = (await tx.container.findUnique({
      where: { id },
      include: {
        destinations: {
          include: {
            pallets: {
              select: {
                status: true,
                loadJobId: true,
                loadedAt: true,
              },
            },
          },
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

  private volumeTotal(destinations: ContainerDestinationRecord[]): string {
    const total = destinations.reduce(
      (sum, destination) => sum + Number(destination.volume.toString()),
      0,
    );
    return total.toFixed(3);
  }

  private packageTypeOrNull(value: string | null | undefined): string | null {
    if (!value || value === 'UNSPECIFIED') {
      return null;
    }
    return value;
  }

  private effectivePackageTypeForResponse(
    value: string | null | undefined,
  ): string | null {
    const packageType = this.packageTypeOrNull(value);
    if (!packageType || packageType === 'UNKNOWN') {
      return 'CARTON';
    }
    return packageType;
  }

  private normalizePackageTypeForStorage(
    value: unknown,
  ): PackageTypeForStorage {
    const packageType = this.stringOrNull(value);
    if (!packageType) {
      return 'CARTON';
    }

    const normalized = this.normalizeText(packageType);
    if (
      normalized === 'CARTON' ||
      normalized === 'CTN' ||
      normalized === 'CTNS'
    ) {
      return 'CARTON';
    }
    if (
      normalized === 'WOODEN_CRATE' ||
      normalized === 'WOODEN CRATE' ||
      normalized === 'WOOD' ||
      normalized === 'WOODEN' ||
      normalized === 'CRATE'
    ) {
      return 'WOODEN_CRATE';
    }
    if (normalized === 'UNKNOWN' || normalized === 'UNSPECIFIED') {
      return 'CARTON';
    }

    throw new BadRequestException({
      code: 'INVALID_PACKAGE_TYPE',
      message: `Unsupported package type: ${packageType}`,
      details: {
        allowedValues: ['CARTON', 'WOODEN_CRATE', 'UNKNOWN', 'UNSPECIFIED'],
        packageType,
      },
    });
  }

  private async calculateDestinationPalletRule(input: {
    cartons: number;
    destinationCode: string | null;
    manualPallets: number | null;
    packageType: PackageTypeForStorage;
    volumeCbm: string;
  }): Promise<DestinationPalletRuleResult> {
    const policy = await this.palletPolicyResolver.resolve();
    const result = calculateDestinationPallets(
      {
        cartons: input.cartons,
        destinationCode: input.destinationCode,
        manualPallets: input.manualPallets,
        packageType: input.packageType,
        volumeCbm: input.volumeCbm,
      },
      policy,
    );
    return {
      ...result,
      storedPackageType: input.packageType,
    };
  }

  private mergePalletRuleWarnings(
    existingWarnings: unknown,
    ruleWarnings: DestinationPalletRuleResult['warnings'],
  ): unknown[] {
    const existingWarningItems: unknown[] = Array.isArray(existingWarnings)
      ? existingWarnings
      : [];
    const preserved = existingWarningItems.filter((warning) => {
      const code =
        warning && typeof warning === 'object'
          ? (warning as Record<string, unknown>).code
          : null;
      return typeof code !== 'string' || !PALLET_RECALC_WARNING_CODES.has(code);
    });

    return [...preserved, ...ruleWarnings];
  }

  private normalizeText(value: string | null | undefined): string {
    if (!value) {
      return '';
    }
    return value.trim().toUpperCase().replace(/\s+/g, ' ');
  }

  private toCorrectionResponse(
    record: CorrectionFeedbackRecord,
  ): CorrectionFeedbackResponseDto {
    return {
      id: record.id,
      targetType: record.targetType,
      importFileId: record.importFileId,
      containerId: record.containerId,
      containerLineId: record.containerLineId,
      containerDestinationId: record.containerDestinationId,
      palletId: record.palletId,
      generatedFileId: record.generatedFileId,
      attendanceImportId: record.attendanceImportId,
      payContainerId: record.payContainerId,
      unloadingWageSettlementId: record.unloadingWageSettlementId,
      fieldName: record.fieldName,
      oldValue: record.oldValue,
      newValue: record.newValue,
      reason: record.reason,
      note: record.note,
      correctedById: record.correctedById,
      createdAt: this.toIsoString(record.createdAt),
      updatedAt: this.toIsoString(record.updatedAt),
    };
  }

  private hasOwn(value: object, key: string): boolean {
    return Object.hasOwn(value, key);
  }

  private hasProvided(value: object, key: string): boolean {
    return (
      this.hasOwn(value, key) &&
      (value as Record<string, unknown>)[key] !== undefined
    );
  }

  private sameValue(left: unknown, right: unknown): boolean {
    if (
      left === null ||
      left === undefined ||
      right === null ||
      right === undefined
    ) {
      return left === right;
    }

    const leftNumber = this.numberOrNull(left);
    const rightNumber = this.numberOrNull(right);
    if (leftNumber !== null || rightNumber !== null) {
      return leftNumber === rightNumber;
    }

    return left === right;
  }

  private sameJsonValue(left: unknown, right: unknown): boolean {
    return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
  }

  private numberOrNull(value: unknown): number | null {
    if (typeof value === 'number') {
      return Number.isNaN(value) ? null : value;
    }

    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed === '') {
        return null;
      }
      const parsed = Number(trimmed);
      return Number.isNaN(parsed) ? null : parsed;
    }

    if (
      typeof value === 'object' &&
      value !== null &&
      this.hasToNumber(value)
    ) {
      const parsed = value.toNumber();
      return typeof parsed === 'number' && !Number.isNaN(parsed)
        ? parsed
        : null;
    }

    return null;
  }

  private hasToNumber(value: object): value is { toNumber(): unknown } {
    return typeof (value as { toNumber?: unknown }).toNumber === 'function';
  }

  private decimalString(value: unknown): string {
    return Number(value).toFixed(3);
  }

  private requiredString(value: unknown, fieldName: string): string {
    const result = this.stringOrNull(value);
    if (result) {
      return result;
    }

    throw new BadRequestException({
      code: 'INVALID_MANUAL_CONTAINER_VALUE',
      message: `${fieldName} cannot be empty.`,
      details: { fieldName },
    });
  }

  private optionalLearningCaseId(value: unknown): string | undefined {
    if (value === undefined) {
      return undefined;
    }
    if (typeof value !== 'string' || !value.trim()) {
      const code = 'PARSER_LEARNING_VALIDATION_FAILED';
      throw new BadRequestException({
        code,
        message: code,
        details: { fields: ['learningCaseId'] },
      });
    }
    return value.trim();
  }

  private stringOrNull(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private nullableJsonValue(value: unknown): NullableJsonInput {
    if (value === undefined || value === null) {
      return Prisma?.JsonNull ?? null;
    }

    const serialized = JSON.stringify(value);
    if (serialized === undefined || serialized === 'null') {
      return Prisma?.JsonNull ?? null;
    }

    return JSON.parse(serialized) as Prisma.InputJsonValue;
  }

  private toIsoString(value: Date | string): string {
    return value instanceof Date ? value.toISOString() : value;
  }

  private throwConflictIfUnique(error: unknown, code: string): void {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2002'
    ) {
      throw new ConflictException({
        code,
        message: 'Correction conflicts with an existing unique value.',
        details: { errorMessage: this.errorMessage(error) },
      });
    }
  }

  private errorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    return 'Unknown correction error';
  }
}
