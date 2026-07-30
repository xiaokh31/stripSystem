import { PrismaPg } from '@prisma/adapter-pg';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, realpath, stat } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { PrismaClient } from '../generated/prisma/client';

interface Candidate {
  id: string;
  containerId: string | null;
  fileType: string;
  storagePath: string;
  fileSha256: string | null;
  createdAt: Date;
}

interface CheckedCandidate extends Candidate {
  actualSha256: string | null;
  finding: string | null;
  valid: boolean;
}

const apply = process.argv.includes('--apply');
const storageRoot = resolve(process.env.STORAGE_ROOT ?? '/workspace/storage');
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL_REQUIRED');
}

const prisma = new PrismaClient({ adapter: new PrismaPg(databaseUrl) });

async function main(): Promise<void> {
  try {
  const groups = await prisma.$queryRaw<
    Array<{ containerId: string; fileType: string }>
  >`
    SELECT "container_id" AS "containerId", "file_type"::text AS "fileType"
    FROM "generated_files"
    WHERE "container_id" IS NOT NULL
      AND "status" = 'GENERATED'
      AND "file_type" IN ('EXCEL_REPORT', 'PALLET_LABEL_PDF')
    GROUP BY "container_id", "file_type"
    HAVING COUNT(*) > 1
    ORDER BY "container_id", "file_type"
  `;
  const auditTableExists = await replacementAuditTableExists(prisma);
  const findings: Array<Record<string, unknown>> = [];

  for (const group of groups) {
    const candidates = (await prisma.generatedFile.findMany({
      where: {
        containerId: group.containerId,
        fileType: group.fileType as never,
        status: 'GENERATED',
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        containerId: true,
        fileType: true,
        storagePath: true,
        fileSha256: true,
        createdAt: true,
      },
    })) as Candidate[];
    const checked = await Promise.all(
      candidates.map((candidate) => checkCandidate(candidate)),
    );
    const sharedPaths = sharedStoragePaths(checked);
    const winner =
      checked.find(
        (candidate) =>
          candidate.valid && !sharedPaths.has(resolve(candidate.storagePath)),
      ) ?? null;
    const losers = checked.filter((candidate) => candidate.id !== winner?.id);
    const findingCode = winner
      ? 'CURRENT_WINNER_VERIFIED'
      : 'NO_VERIFIABLE_CURRENT_ARTIFACT';

    findings.push({
      containerId: group.containerId,
      fileType: group.fileType,
      findingCode,
      winnerId: winner?.id ?? null,
      winnerSha256: winner?.actualSha256 ?? null,
      candidateCount: checked.length,
      invalidIds: checked
        .filter((candidate) => !candidate.valid)
        .map((candidate) => candidate.id),
      sharedPathIds: checked
        .filter((candidate) =>
          sharedPaths.has(resolve(candidate.storagePath)),
        )
        .map((candidate) => candidate.id),
      apply,
    });

    if (!apply) {
      continue;
    }

    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        `generated-file-current:${group.containerId}:${group.fileType}`,
      );
      const stillCurrent = await tx.generatedFile.findMany({
        where: {
          containerId: group.containerId,
          fileType: group.fileType as never,
          status: 'GENERATED',
        },
        select: { id: true },
      });
      if (
        stillCurrent.length !== candidates.length ||
        stillCurrent.some(
          (record) => !candidates.some((candidate) => candidate.id === record.id),
        )
      ) {
        throw new Error('CURRENT_REPAIR_CONCURRENT_CHANGE');
      }

      if (!winner) {
        await tx.generatedFile.updateMany({
          where: { id: { in: losers.map((candidate) => candidate.id) } },
          data: {
            status: 'SUPERSEDED',
            errorMessage: 'CURRENT_REPAIR_NO_VERIFIABLE_ARTIFACT',
          },
        });
        return;
      }

      await tx.generatedFile.updateMany({
        where: { id: { in: losers.map((candidate) => candidate.id) } },
        data: {
          status: 'SUPERSEDED',
          errorMessage: auditTableExists
            ? null
            : `CURRENT_REPAIR_REPLACED_BY:${winner.id}`,
        },
      });
      if (auditTableExists && losers.length > 0) {
        await tx.generatedFileReplacement.createMany({
          data: losers.map((candidate) => ({
            id: randomUUID(),
            containerId: group.containerId,
            fileType: group.fileType as never,
            oldGeneratedFileId: candidate.id,
            newGeneratedFileId: winner.id,
            replacedById: null,
            reasonCode: 'VERIFIED_STORAGE_REPAIR',
          })),
          skipDuplicates: true,
        });
      }
    });
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        apply,
        duplicateGroupCount: groups.length,
        findings,
      },
      null,
      2,
    )}\n`,
  );
  } finally {
    await prisma.$disconnect();
  }
}

void main();

async function checkCandidate(candidate: Candidate): Promise<CheckedCandidate> {
  try {
    const resolved = resolve(candidate.storagePath);
    const rootReal = await realpath(storageRoot);
    const fileReal = await realpath(resolved);
    if (
      fileReal !== rootReal &&
      !fileReal.startsWith(`${rootReal}${sep}`)
    ) {
      return invalid(candidate, 'STORAGE_PATH_OUTSIDE_ROOT');
    }
    const fileStat = await stat(fileReal);
    if (!fileStat.isFile()) {
      return invalid(candidate, 'STORAGE_PATH_NOT_FILE');
    }
    const actualSha256 = createHash('sha256')
      .update(await readFile(fileReal))
      .digest('hex');
    if (!candidate.fileSha256 || candidate.fileSha256 !== actualSha256) {
      return {
        ...candidate,
        actualSha256,
        finding: 'STORAGE_SHA_MISMATCH',
        valid: false,
      };
    }
    return {
      ...candidate,
      actualSha256,
      finding: null,
      valid: true,
    };
  } catch {
    return invalid(candidate, 'STORAGE_FILE_UNREADABLE');
  }
}

function invalid(candidate: Candidate, finding: string): CheckedCandidate {
  return {
    ...candidate,
    actualSha256: null,
    finding,
    valid: false,
  };
}

function sharedStoragePaths(candidates: CheckedCandidate[]): Set<string> {
  const counts = new Map<string, number>();
  candidates.forEach((candidate) => {
    const key = resolve(candidate.storagePath);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });
  return new Set(
    [...counts.entries()]
      .filter(([, count]) => count > 1)
      .map(([storagePath]) => storagePath),
  );
}

async function replacementAuditTableExists(
  client: PrismaClient,
): Promise<boolean> {
  const rows = await client.$queryRaw<Array<{ present: boolean }>>`
    SELECT to_regclass('public.generated_file_replacements') IS NOT NULL AS "present"
  `;
  return rows[0]?.present === true;
}
