import { PrismaPg } from '@prisma/adapter-pg';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, realpath, stat } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { PrismaClient } from '../generated/prisma/client';
import {
  FILENAME_REVIEW_CODES,
  projectCanonicalFilename,
} from '../common/upload-filename';

type RepairModel = 'ImportFile' | 'AttendanceImport';

interface RepairRecord {
  id: string;
  model: RepairModel;
  originalFilename: string;
  transportFilename: string | null;
  storedPath: string;
  fileSha256: string;
  expectedExtension: '.xlsx' | '.xls';
}

interface RepairFinding extends RepairRecord {
  canonicalFilename: string;
  roundTripVerdict: 'REVERSIBLE' | 'AMBIGUOUS' | 'NOT_CANDIDATE';
  reasonCode: string;
  eligible: boolean;
}

interface BackupManifest {
  contractVersion: 'bestar-matched-backup-v1';
  snapshotId: string;
  postgres: { path: string; sha256: string };
  storage: { path: string; sha256: string };
}

const apply = process.argv.includes('--apply');
const backupManifestPath = argumentValue('--backup-manifest');
const databaseUrl = process.env.DATABASE_URL;
const storageRoot = resolve(process.env.STORAGE_ROOT ?? '/workspace/storage');

if (!databaseUrl) throw new Error('DATABASE_URL_REQUIRED');

const prisma = new PrismaClient({ adapter: new PrismaPg(databaseUrl) });

async function main(): Promise<void> {
  try {
    const records = await loadRecords();
    const analyzed = records.map(analyzeRecord);
    const candidates = analyzed.filter(
      (finding) => finding.roundTripVerdict !== 'NOT_CANDIDATE',
    );
    const checked = await Promise.all(candidates.map(checkStorageEvidence));
    const eligible = checked.filter((finding) => finding.eligible);

    if (apply) {
      if (!backupManifestPath) {
        throw new Error('MATCHED_BACKUP_MANIFEST_REQUIRED');
      }
      await validateBackupManifest(backupManifestPath);
      await applyRepairs(eligible);
    }

    const afterRecords = apply ? await loadRecords() : records;
    const afterCandidateCount = afterRecords
      .map(analyzeRecord)
      .filter((finding) => finding.roundTripVerdict !== 'NOT_CANDIDATE').length;
    process.stdout.write(
      `${JSON.stringify(
        {
          contractVersion: 'upload-filename-repair-v1',
          mode: apply ? 'apply' : 'dry-run',
          beforeCount: records.length,
          dryRunCandidateCount: candidates.length,
          eligibleCount: eligible.length,
          skippedCount: checked.length - eligible.length,
          applyCount: apply ? eligible.length : 0,
          afterCandidateCount,
          findings: checked.map(safeFinding),
        },
        null,
        2,
      )}\n`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

async function loadRecords(): Promise<RepairRecord[]> {
  const [imports, attendance] = await Promise.all([
    prisma.importFile.findMany({
      select: {
        id: true,
        originalFilename: true,
        transportFilename: true,
        storedPath: true,
        fileSha256: true,
      },
      orderBy: { id: 'asc' },
    }),
    prisma.attendanceImport.findMany({
      select: {
        id: true,
        originalFilename: true,
        transportFilename: true,
        storedPath: true,
        fileSha256: true,
      },
      orderBy: { id: 'asc' },
    }),
  ]);
  return [
    ...imports.map((record) => ({
      ...record,
      model: 'ImportFile' as const,
      expectedExtension: '.xlsx' as const,
    })),
    ...attendance.map((record) => ({
      ...record,
      model: 'AttendanceImport' as const,
      expectedExtension: '.xls' as const,
    })),
  ];
}

function analyzeRecord(record: RepairRecord): RepairFinding {
  const projection = projectCanonicalFilename(
    record.originalFilename,
    record.expectedExtension,
  );
  if (projection.recoveredTransportEncoding && !projection.reviewCode) {
    return {
      ...record,
      canonicalFilename: projection.originalFilename,
      roundTripVerdict: 'REVERSIBLE',
      reasonCode: 'REVERSIBLE_MOJIBAKE_CANDIDATE',
      eligible: true,
    };
  }
  if (
    projection.reviewCode === FILENAME_REVIEW_CODES.ambiguousEncoding ||
    projection.reviewCode === FILENAME_REVIEW_CODES.invalidUtf8
  ) {
    return {
      ...record,
      canonicalFilename: record.originalFilename,
      roundTripVerdict: 'AMBIGUOUS',
      reasonCode: projection.reviewCode,
      eligible: false,
    };
  }
  return {
    ...record,
    canonicalFilename: projection.originalFilename,
    roundTripVerdict: 'NOT_CANDIDATE',
    reasonCode: 'NO_REVERSIBLE_MOJIBAKE_EVIDENCE',
    eligible: false,
  };
}

async function checkStorageEvidence(
  finding: RepairFinding,
): Promise<RepairFinding> {
  if (!finding.eligible) return finding;
  try {
    const rootReal = await realpath(storageRoot);
    const fileReal = await realpath(resolve(finding.storedPath));
    if (fileReal !== rootReal && !fileReal.startsWith(`${rootReal}${sep}`)) {
      return skip(finding, 'STORAGE_PATH_OUTSIDE_ROOT');
    }
    const fileStat = await stat(fileReal);
    if (!fileStat.isFile()) return skip(finding, 'STORAGE_PATH_NOT_FILE');
    const actualSha = await sha256File(fileReal);
    if (actualSha !== immutableSha(finding.fileSha256)) {
      return skip(finding, 'STORAGE_SHA_MISMATCH');
    }
    return finding;
  } catch {
    return skip(finding, 'STORAGE_FILE_UNREADABLE');
  }
}

async function applyRepairs(findings: RepairFinding[]): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      'upload-filename-repair-v1',
    );
    for (const finding of findings) {
      const current =
        finding.model === 'ImportFile'
          ? await tx.importFile.findUnique({ where: { id: finding.id } })
          : await tx.attendanceImport.findUnique({ where: { id: finding.id } });
      if (!current || current.originalFilename !== finding.originalFilename) {
        throw new Error('FILENAME_REPAIR_CONCURRENT_CHANGE');
      }
      const data = {
        originalFilename: finding.canonicalFilename,
        transportFilename:
          finding.transportFilename ?? finding.originalFilename,
        filenameCodecVersion: 'upload-filename-v1-repair',
        filenameReviewCode: null,
      };
      if (finding.model === 'ImportFile') {
        await tx.importFile.update({ where: { id: finding.id }, data });
      } else {
        await tx.attendanceImport.update({ where: { id: finding.id }, data });
      }
    }
  });
}

async function validateBackupManifest(path: string): Promise<void> {
  const parsed: unknown = JSON.parse(await readFile(path, 'utf8'));
  if (
    !isRecord(parsed) ||
    parsed.contractVersion !== 'bestar-matched-backup-v1' ||
    typeof parsed.snapshotId !== 'string' ||
    !parsed.snapshotId.trim() ||
    !isBackupArtifact(parsed.postgres) ||
    !isBackupArtifact(parsed.storage)
  ) {
    throw new Error('MATCHED_BACKUP_MANIFEST_INVALID');
  }
  const manifest: BackupManifest = {
    contractVersion: parsed.contractVersion,
    snapshotId: parsed.snapshotId,
    postgres: parsed.postgres,
    storage: parsed.storage,
  };
  for (const artifact of [manifest.postgres, manifest.storage]) {
    const artifactStat = await stat(artifact.path);
    if (!artifactStat.isFile() || artifactStat.size === 0) {
      throw new Error('MATCHED_BACKUP_ARTIFACT_INVALID');
    }
    if ((await sha256File(artifact.path)) !== artifact.sha256.toLowerCase()) {
      throw new Error('MATCHED_BACKUP_SHA_MISMATCH');
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isBackupArtifact(
  value: unknown,
): value is BackupManifest['postgres'] {
  return (
    isRecord(value) &&
    typeof value.path === 'string' &&
    value.path.length > 0 &&
    typeof value.sha256 === 'string' &&
    /^[a-f0-9]{64}$/iu.test(value.sha256)
  );
}

function safeFinding(finding: RepairFinding): Record<string, unknown> {
  return {
    id: finding.id,
    model: finding.model,
    oldEscapedFilename: escapeCodePoints(finding.originalFilename),
    newEscapedFilename: escapeCodePoints(finding.canonicalFilename),
    roundTripVerdict: finding.roundTripVerdict,
    eligible: finding.eligible,
    reasonCode: finding.reasonCode,
  };
}

function escapeCodePoints(value: string): string {
  return [...value]
    .map((character) => {
      const point = character.codePointAt(0)!;
      return point >= 0x21 && point <= 0x7e
        ? character
        : `\\u{${point.toString(16).toUpperCase()}}`;
    })
    .join('');
}

function immutableSha(value: string): string {
  const match = value.match(/[a-f0-9]{64}$/iu);
  return match?.[0]?.toLowerCase() ?? '';
}

function skip(finding: RepairFinding, reasonCode: string): RepairFinding {
  return { ...finding, eligible: false, reasonCode };
}

async function sha256File(path: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path) as AsyncIterable<Buffer>) {
    hash.update(chunk);
  }
  return hash.digest('hex');
}

function argumentValue(name: string): string | null {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : null;
}

void main().catch((error: unknown) => {
  process.stderr.write(
    `${JSON.stringify({
      code: error instanceof Error ? error.message : 'FILENAME_REPAIR_FAILED',
    })}\n`,
  );
  process.exitCode = 1;
});
