import { randomUUID } from 'node:crypto';
import {
  GeneratedFileStatus,
  GeneratedFileType,
} from '../generated/prisma/enums';

export const CURRENT_ARTIFACT_TYPES = [
  GeneratedFileType.EXCEL_REPORT,
  GeneratedFileType.PALLET_LABEL_PDF,
] as const;

export type CurrentArtifactType = (typeof CURRENT_ARTIFACT_TYPES)[number];

export interface CurrentArtifactRecord {
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
  generatedById?: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface ActivateCurrentArtifactInput {
  importFileId: string | null;
  containerId: string;
  fileType: CurrentArtifactType;
  storagePath: string;
  fileSha256: string;
  mimeType: string;
  fileSizeBytes: bigint;
  generatedById: string;
  reasonCode?: string;
}

interface CurrentArtifactWriteClient {
  $executeRawUnsafe?: (
    query: string,
    ...values: unknown[]
  ) => Promise<number>;
  generatedFile: {
    findMany(args: unknown): Promise<CurrentArtifactRecord[]>;
    updateMany(args: unknown): Promise<unknown>;
    create(args: unknown): Promise<CurrentArtifactRecord>;
  };
  generatedFileReplacement?: {
    createMany(args: unknown): Promise<unknown>;
  };
}

export class CurrentArtifactService {
  async activate(
    tx: CurrentArtifactWriteClient,
    input: ActivateCurrentArtifactInput,
  ): Promise<CurrentArtifactRecord> {
    await this.lock(tx, input.containerId, input.fileType);
    const previous = await tx.generatedFile.findMany({
      where: {
        containerId: input.containerId,
        fileType: input.fileType,
        status: GeneratedFileStatus.GENERATED,
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });

    if (previous.length > 0) {
      await tx.generatedFile.updateMany({
        where: { id: { in: previous.map((record) => record.id) } },
        data: { status: GeneratedFileStatus.SUPERSEDED },
      });
    }

    const current = await tx.generatedFile.create({
      data: {
        importFileId: input.importFileId,
        containerId: input.containerId,
        fileType: input.fileType,
        storagePath: input.storagePath,
        fileSha256: input.fileSha256,
        mimeType: input.mimeType,
        fileSizeBytes: input.fileSizeBytes,
        status: GeneratedFileStatus.GENERATED,
        errorMessage: null,
        generatedById: input.generatedById,
      },
    });

    if (previous.length > 0 && tx.generatedFileReplacement) {
      await tx.generatedFileReplacement.createMany({
        data: previous.map((record) => ({
          id: randomUUID(),
          containerId: input.containerId,
          fileType: input.fileType,
          oldGeneratedFileId: record.id,
          newGeneratedFileId: current.id,
          replacedById: input.generatedById,
          reasonCode: input.reasonCode ?? 'SUCCESSFUL_REGENERATION',
        })),
        skipDuplicates: true,
      });
    }

    return current;
  }

  async recordFailure(
    tx: CurrentArtifactWriteClient,
    input: Omit<ActivateCurrentArtifactInput, 'fileSha256' | 'fileSizeBytes'> & {
      errorCode: string;
    },
  ): Promise<CurrentArtifactRecord> {
    return await tx.generatedFile.create({
      data: {
        importFileId: input.importFileId,
        containerId: input.containerId,
        fileType: input.fileType,
        storagePath: input.storagePath,
        fileSha256: null,
        mimeType: input.mimeType,
        fileSizeBytes: null,
        status: GeneratedFileStatus.FAILED,
        errorMessage: input.errorCode,
        generatedById: input.generatedById,
      },
    });
  }

  isCurrentType(value: string): value is CurrentArtifactType {
    return (CURRENT_ARTIFACT_TYPES as readonly string[]).includes(value);
  }

  private async lock(
    tx: CurrentArtifactWriteClient,
    containerId: string,
    fileType: CurrentArtifactType,
  ): Promise<void> {
    if (!tx.$executeRawUnsafe) {
      return;
    }
    await tx.$executeRawUnsafe(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      `generated-file-current:${containerId}:${fileType}`,
    );
  }
}
