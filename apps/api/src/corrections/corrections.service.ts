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
} from '../generated/prisma/enums';
import {
  effectiveContainerStatus,
  isContainerGenerationLocked,
} from '../common/container-lifecycle';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

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
  status: string;
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
  cartons: number;
  volume: { toString(): string } | number | string;
  calculatedPallets: number;
  manualPallets: number | null;
  finalPallets: number;
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
] as const;

@Injectable()
export class CorrectionsService {
  constructor(private readonly prisma: PrismaService) {}

  async getContainer(id: string): Promise<ContainerDetailResponseDto> {
    const container = (await this.prisma.container.findUnique({
      where: { id },
      include: {
        destinations: {
          orderBy: [{ destinationCode: 'asc' }, { destinationType: 'asc' }],
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

    return this.toContainerDetailResponse(container);
  }

  async createManualContainer(
    dto: CreateManualContainerDto,
  ): Promise<ManualContainerResponseDto> {
    const containerNo = this.requiredString(dto.containerNo, 'containerNo');
    const destinationInputs = dto.destinations.map((destination, index) =>
      this.toManualDestinationCreateInput(destination, index + 1),
    );
    const createdAt = new Date();

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const container = (await tx.container.create({
          data: {
            containerNo,
            sourceFormat: FileFormat.UNKNOWN,
            parserVersion: 'manual-entry-v1',
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
          dto.correctedById,
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
              dto.correctedById,
            )),
          );
        }

        return {
          container: {
            ...container,
            destinations,
          },
          corrections,
        };
      });

      return {
        container: this.toContainerDetailResponse(result.container),
        corrections: result.corrections.map((record) =>
          this.toCorrectionResponse(record),
        ),
      };
    } catch (error) {
      this.throwConflictIfUnique(error, 'MANUAL_CONTAINER_CREATE_CONFLICT');
      throw error;
    }
  }

  async updateContainer(
    id: string,
    dto: UpdateContainerDto,
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
    this.assertContainerEditableForStatusUpdate(existing, dto.status);

    const data: Prisma.ContainerUpdateInput = {};
    const changes: Change[] = [];
    this.addStringChange(dto, existing, data, changes, 'containerNo');
    this.addNullableStringChange(dto, existing, data, changes, 'dockNo');
    this.addNullableStringChange(dto, existing, data, changes, 'company');
    this.addStatusChange(dto, existing, data, changes);
    if (!this.hasProvided(dto, 'status') && changes.length > 0) {
      data.status = ContainerStatus.CORRECTED;
    }
    this.assertHasChanges(changes);

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const container = (await tx.container.update({
          where: { id },
          data,
        })) as ContainerRecord;
        const corrections = await this.createCorrections(
          tx,
          changes,
          {
            targetType: CorrectionTargetType.CONTAINER,
            containerId: id,
          },
          dto.reason,
          dto.correctionNote,
          dto.correctedById,
        );

        return { container, corrections };
      });

      return {
        container: this.toContainerResponse(result.container),
        corrections: result.corrections.map((record) =>
          this.toCorrectionResponse(record),
        ),
      };
    } catch (error) {
      this.throwConflictIfUnique(error, 'CONTAINER_CORRECTION_CONFLICT');
      throw error;
    }
  }

  async updateContainerDestination(
    id: string,
    dto: UpdateContainerDestinationDto,
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
    this.applyManualPalletsChange(dto, existing, data, changes);
    this.assertHasChanges(changes);

    try {
      const result = await this.prisma.$transaction(async (tx) => {
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
          dto.correctedById,
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
    const volume = this.decimalString(dto.volume);
    const createData: Prisma.ContainerDestinationUncheckedCreateInput = {
      containerId,
      destinationCode,
      destinationType: this.stringOrNull(dto.destinationType),
      cartons: Number(dto.cartons),
      volume,
      calculatedPallets: 0,
      manualPallets,
      finalPallets: manualPallets ?? 0,
      note: this.stringOrNull(dto.note),
      warnings: [],
      errors: [],
    };
    const change: Change = {
      fieldName: 'containerDestination',
      oldValue: null,
      newValue: {
        destinationCode: createData.destinationCode,
        destinationType: createData.destinationType,
        cartons: createData.cartons,
        volume: createData.volume,
        manualPallets: createData.manualPallets,
        finalPallets: createData.finalPallets,
        note: createData.note,
      },
    };

    try {
      const result = await this.prisma.$transaction(async (tx) => {
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
          dto.correctedById,
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

  async createCorrection(
    dto: CreateCorrectionDto,
  ): Promise<CorrectionFeedbackResponseDto> {
    const targetType = this.targetType(dto.targetType);
    const target = this.targetForDto(dto, targetType);
    this.assertCorrectionValuesProvided(dto);

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
          correctedById: this.stringOrNull(dto.correctedById),
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

  private toManualDestinationCreateInput(
    dto: CreateManualContainerDestinationDto,
    sequence: number,
  ): Omit<Prisma.ContainerDestinationUncheckedCreateInput, 'containerId'> {
    const destinationCode = this.requiredString(
      dto.destinationCode,
      `destinations[${sequence}].destinationCode`,
    );
    const cartons = Number(dto.cartons);
    const pallets = Number(dto.pallets);

    return {
      destinationCode,
      destinationType: this.stringOrNull(dto.destinationType),
      cartons,
      volume:
        dto.volume === undefined || dto.volume === null
          ? '0.000'
          : this.decimalString(dto.volume),
      calculatedPallets: 0,
      manualPallets: pallets,
      finalPallets: pallets,
      note: this.stringOrNull(dto.note),
      warnings: [],
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

  private applyManualPalletsChange(
    dto: UpdateContainerDestinationDto,
    existing: ContainerDestinationRecord,
    data: Prisma.ContainerDestinationUpdateInput,
    changes: Change[],
  ): void {
    if (!this.hasProvided(dto, 'manualPallets')) {
      return;
    }

    const manualPallets =
      dto.manualPallets === null || dto.manualPallets === undefined
        ? null
        : Number(dto.manualPallets);
    const finalPallets = manualPallets ?? existing.calculatedPallets;

    if (!this.sameValue(existing.manualPallets, manualPallets)) {
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
      value === CorrectionTargetType.GENERATED_FILE
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
      updatedAt: this.toIsoString(record.updatedAt),
    };
  }

  private toContainerDestinationResponse(record: ContainerDestinationRecord) {
    return {
      id: record.id,
      containerId: record.containerId,
      destinationCode: record.destinationCode,
      destinationType: record.destinationType,
      cartons: record.cartons,
      volume: record.volume.toString(),
      calculatedPallets: record.calculatedPallets,
      manualPallets: record.manualPallets,
      finalPallets: record.finalPallets,
      note: record.note,
      updatedAt: this.toIsoString(record.updatedAt),
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
        totalCartons: destination.cartons,
        totalVolumeCbm: destination.volume.toString(),
        calculatedPallets: destination.calculatedPallets,
        manualPallets: destination.manualPallets,
        finalPallets: destination.finalPallets,
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

  private assertContainerEditableForStatusUpdate(
    container: ContainerRecord,
    requestedStatus: string | undefined,
  ): void {
    const effectiveStatus = effectiveContainerStatus(
      container.status,
      container.destinations ?? [],
    );
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

    const activePallets = this.activePallets(container);
    const loadedPallets = activePallets.filter((pallet) =>
      this.isLoadedPallet(pallet),
    );
    if (
      activePallets.length > 0 &&
      loadedPallets.length === activePallets.length
    ) {
      return;
    }

    throw new ConflictException({
      code: 'CONTAINER_STATUS_REQUIRES_EMPTY_INVENTORY',
      message:
        'Container status can only be set to LOADED when every active pallet has been loaded by scan transactions.',
      details: {
        containerId: container.id,
        activePallets: activePallets.length,
        loadedPallets: loadedPallets.length,
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

  private isLoadedPallet(
    pallet: NonNullable<ContainerDestinationRecord['pallets']>[number],
  ): boolean {
    return pallet.status === 'LOADED' || Boolean(pallet.loadedAt);
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
